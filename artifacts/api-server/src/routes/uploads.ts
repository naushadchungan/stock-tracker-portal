import { Router } from "express";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { db } from "@workspace/db";
import { uploadsTable, stockItemsTable, depotsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { requireAdmin } from "../middlewares/requireAuth";
import Anthropic from "@anthropic-ai/sdk";

const execAsync = promisify(exec);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// ── Python script: text + image extraction only ───────────────────────────────
// Claude handles all structured parsing; Python just pulls raw text and tile images.
// If the PDF has no text layer at all (fully image-based, e.g. Starko/Kresto),
// each page is rendered as a PNG so Claude Vision can OCR the content.
const PYTHON_SCRIPT = `
import fitz
import json
import sys
import base64

def get_tile_images(page, doc):
    images = []
    seen   = set()
    page_w = page.rect.width
    for info in page.get_images(full=True):
        xref = info[0]
        if xref in seen:
            continue
        seen.add(xref)
        try:
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            w, h = r.width, r.height
            if w < 60 or h < 40 or w > 300 or h > 300:
                continue
            if r.x0 < page_w * 0.45:
                continue
            img_dict = doc.extract_image(xref)
            if not img_dict or not img_dict.get('image'):
                continue
            raw = img_dict['image']
            if len(raw) > 700000:
                continue
            images.append({'b64': base64.b64encode(raw).decode('utf-8'), 'y': float(r.y0)})
        except Exception:
            pass
    images.sort(key=lambda i: i['y'])
    return images

def page_to_visual_text(page):
    """Reconstruct visual layout row-by-row using word X/Y positions.
    Words in the same visual row are grouped by Y coordinate.
    Large horizontal gaps between words are represented as multiple spaces
    so column structure is preserved for downstream parsing.
    """
    words = page.get_text('words')  # (x0,y0,x1,y1,word,block,line,word_no)
    if not words:
        return ''

    row_tolerance = 5   # px — words within this Y range share a visual row
    col_gap_min   = 40  # px — gaps larger than this indicate a new column

    rows = {}
    for w in words:
        x0, y0, x1, y1, word = w[0], w[1], w[2], w[3], w[4]
        row_key = round(y0 / row_tolerance) * row_tolerance
        if row_key not in rows:
            rows[row_key] = []
        rows[row_key].append((x0, x1, word))

    lines = []
    for row_y in sorted(rows.keys()):
        row_words = sorted(rows[row_y], key=lambda ww: ww[0])
        parts = []
        prev_x1 = None
        for x0, x1, word in row_words:
            if prev_x1 is not None:
                gap = x0 - prev_x1
                if gap > col_gap_min:
                    # Represent column separator with spaces proportional to gap
                    parts.append(' ' * max(4, int(gap / 6)))
                else:
                    parts.append(' ')   # normal word spacing
            parts.append(word)
            prev_x1 = x1
        lines.append(''.join(parts))

    return '\\n'.join(lines)

if __name__ == '__main__':
    path     = sys.argv[1]
    out_path = sys.argv[2]
    doc      = fitz.open(path)

    all_text   = []
    all_images = []

    for page_num in range(doc.page_count):
        page = doc[page_num]
        all_text.append(page_to_visual_text(page))
        for img in get_tile_images(page, doc):
            img['page'] = page_num
            all_images.append(img)

    joined_text = '\\n'.join(all_text)
    has_text = bool(joined_text.strip())

    # If the PDF has no text layer (fully image-based), render every page as PNG
    # so the Node.js caller can pass them to Claude Vision for OCR-based extraction.
    page_images = []
    if not has_text:
        for page_num in range(doc.page_count):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(1.0, 1.0), alpha=False)
            png_bytes = pix.tobytes('png')
            page_images.append({
                'b64': base64.b64encode(png_bytes).decode('utf-8'),
                'page': page_num,
                'mime': 'image/png'
            })

    doc.close()

    with open(out_path, 'w') as f:
        json.dump({
            'text': joined_text,
            'images': all_images,
            'page_images': page_images
        }, f)
`;

// ── Types ─────────────────────────────────────────────────────────────────────
type ParsedItem = {
  tileName: string;
  brand: string | null;
  size: string | null;
  finish: string | null;
  boxCount: number | null;
  pcsCount: number | null;
  imageData: string | null;
  location: string | null;
};

// ── Anthropic client (Replit AI Integrations — no user API key needed) ────────
const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
});

// ── Shared JSON extraction helper ─────────────────────────────────────────────
function extractJsonArray(text: string): unknown[] | null {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const p = JSON.parse(jsonMatch[0]);
      if (Array.isArray(p)) return p;
    } catch { /* fall through to recovery */ }
  }
  // Truncation recovery: response cut off mid-array — close and parse what we have
  const arrayStart = text.indexOf("[");
  if (arrayStart === -1) return null;
  let partial = text.slice(arrayStart);
  const lastClose = partial.lastIndexOf("}");
  if (lastClose === -1) return null;
  partial = partial.slice(0, lastClose + 1) + "]";
  try {
    const p = JSON.parse(partial);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

// ── Vision-based parser (for fully image-based PDFs, e.g. Starko/Kresto) ──────
// Used when Python text extraction yields nothing. Renders pages as PNGs and
// sends them to Claude Vision for OCR-based structured extraction.
//
// Pages are processed in batches of VISION_BATCH_SIZE to keep each request small.
// Each batch is retried up to MAX_VISION_RETRIES times with exponential backoff
// on overloaded_error (HTTP 529) responses.

const VISION_BATCH_SIZE = 15;   // pages per Claude Vision call
const MAX_VISION_RETRIES = 4;   // attempts per batch before giving up

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string };
};

function makeImageBlock(pi: { b64: string; mime: string }): ImageBlock {
  return {
    type: "image" as const,
    source: {
      type:       "base64" as const,
      media_type: (pi.mime === "image/jpeg" ? "image/jpeg" : "image/png") as "image/png" | "image/jpeg",
      data:       pi.b64,
    },
  };
}

function isOverloadedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("overloaded_error") ||
    msg.includes("Overloaded") ||
    msg.includes("529") ||
    (typeof (err as Record<string,unknown>)?.status === "number" && (err as Record<string,unknown>).status === 529)
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call Claude Vision for one batch of page images, with retry on overload. */
async function visionBatchWithRetry(
  imageBlocks: ImageBlock[],
  promptText: string,
): Promise<Record<string, unknown>[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_VISION_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 15s, 30s, 60s
      await sleep(15_000 * Math.pow(2, attempt - 1));
    }
    try {
      let fullText = "";
      const stream = await anthropic.messages.stream({
        model:      "claude-sonnet-4-6",
        max_tokens: 16000,
        messages: [{
          role:    "user",
          content: [...imageBlocks, { type: "text" as const, text: promptText }],
        }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullText += event.delta.text;
        }
      }
      return (extractJsonArray(fullText) ?? []) as Record<string, unknown>[];
    } catch (err) {
      if (isOverloadedError(err)) {
        lastErr = err;
        continue; // retry after backoff
      }
      throw err; // non-retryable — bubble up immediately
    }
  }
  throw lastErr ?? new Error("Claude Vision overloaded after retries");
}

async function parseViaVision(
  pageImages: Array<{ b64: string; page: number; mime: string }>,
  tileImages: Array<{ b64: string; y: number; page: number }>
): Promise<ParsedItem[]> {
  // Build mutable tile-image queues keyed by actual page number
  const tileQueueByPage = new Map<number, string[]>();
  for (const img of tileImages) {
    const arr = tileQueueByPage.get(img.page) ?? [];
    arr.push(img.b64);
    tileQueueByPage.set(img.page, arr);
  }

  const allRaw: Record<string, unknown>[] = [];

  // Process pages in batches so each Claude call is small and retryable
  for (let batchStart = 0; batchStart < pageImages.length; batchStart += VISION_BATCH_SIZE) {
    const batch = pageImages.slice(batchStart, batchStart + VISION_BATCH_SIZE);
    const imageBlocks = batch.map(makeImageBlock);

    // Tell Claude whether the cover page (actual page 0) is in this batch
    const coverNote =
      batchStart === 0
        ? "The FIRST image in this batch is the catalog cover page — skip it, it contains no stock items."
        : "There is no cover page in this batch — all images are data pages.";

    const promptText = `You are a tile stock data extractor for an Indian tiles business.
The images are pages ${batchStart}–${batchStart + batch.length - 1} of a Kresto/Starko tile stock list PDF.
${coverNote}

Each data page shows a 3-column table:
  Column 1 (left)   — Item Name  (e.g. "KRESTO TANISHQE BEIGE")
  Column 2 (centre) — Qty        (e.g. "108 BOX" or "OUT OF STOCK")
  Column 3 (right)  — Picture    (tile photo — ignore)

Section header rows (coloured/shaded background, e.g. "1200x1800 GLOSSY SERIES",
"800x600 MATT SERIES", "600X600 GLOSSY SERIES") are NOT items.
Extract size (e.g. "1200X1800") and finish (e.g. "GLOSSY") from them and apply
to every item that follows until the next header.

Rules:
  • tileName  : Full text in the Item Name cell. Include size prefix if present (e.g. "600X1200 KRESTO ELITE BROWN").
  • brand     : Brand name in the item name (e.g. "KRESTO", "LAVIT", "ONE TOUCH") or null.
  • size      : From the section header above, or embedded in the item name if present.
  • finish    : From the section header (GLOSSY, MATT, etc.) or item name if stated.
  • boxCount  : "NNN BOX" → NNN (number); "OUT OF STOCK" → 0. Never null.
  • pcsCount  : null.
  • location  : null.
  • pageIndex : Index of the image in THIS batch that the item came from (0 = first image of this batch).

Output ONLY a raw JSON array. Each element on a SINGLE LINE. No markdown. No explanation.
Example (first batch, page 1 = index 1 in batch):
[{"tileName":"KRESTO TANISHQE BEIGE","brand":"KRESTO","size":"1200X1800","finish":"GLOSSY","boxCount":0,"pcsCount":null,"location":null,"pageIndex":1}]

Include ALL items. Skip cover, section headers, footers, emails, page numbers.`;

    const batchItems = await visionBatchWithRetry(imageBlocks, promptText);
    console.log(`[vision] batch pages ${batchStart}–${batchStart + batch.length - 1}: ${batchItems.length} items`);

    // Translate local pageIndex → actual page number, then accumulate
    for (const item of batchItems) {
      const localIdx  = item.pageIndex != null ? Number(item.pageIndex) : null;
      const actualPage = localIdx != null ? batchStart + localIdx : null;
      allRaw.push({ ...item, _actualPage: actualPage });
    }
  }

  // Map raw items to ParsedItem, matching tile photos by actual page number
  return allRaw
    .map((item) => {
      const actualPage = item._actualPage != null ? Number(item._actualPage) : null;
      let imageData: string | null = null;
      if (actualPage !== null) {
        const queue = tileQueueByPage.get(actualPage);
        if (queue && queue.length > 0) imageData = queue.shift() ?? null;
      }
      return {
        tileName: String(item.tileName  ?? "").trim(),
        brand:    item.brand  ? String(item.brand).trim()  : null,
        size:     item.size   ? String(item.size).trim()   : null,
        finish:   item.finish ? String(item.finish).trim() : null,
        boxCount: item.boxCount != null ? Number(item.boxCount) : null,
        pcsCount: item.pcsCount != null ? Number(item.pcsCount) : null,
        imageData,
        location: null,
      };
    })
    .filter((item) => item.tileName.length > 0);
}

// ── Main parser ───────────────────────────────────────────────────────────────
async function parsePdf(pdfBuffer: Buffer): Promise<ParsedItem[]> {
  const tmpId      = randomBytes(8).toString("hex");
  const pdfPath    = join(tmpdir(), `upload_${tmpId}.pdf`);
  const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);
  const outPath    = join(tmpdir(), `result_${tmpId}.json`);

  let rawText = "";
  let images:      { b64: string; y: number; page: number }[] = [];
  let pageImages:  { b64: string; page: number; mime: string }[] = [];

  try {
    await Promise.all([
      writeFile(pdfPath, pdfBuffer),
      writeFile(scriptPath, PYTHON_SCRIPT),
    ]);
    try {
      await execAsync(`python3 "${scriptPath}" "${pdfPath}" "${outPath}"`, { timeout: 120_000 });
    } catch (pyErr: any) {
      const stderr = pyErr?.stderr ?? "";
      const stdout = pyErr?.stdout ?? "";
      throw new Error(`Python script failed.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`);
    }
    const raw = JSON.parse(await readFile(outPath, "utf8"));
    rawText     = raw.text        ?? "";
    images      = raw.images      ?? [];
    pageImages  = raw.page_images ?? [];
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(scriptPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);
  }

  // ── Image-only PDF (no text layer) → use Claude Vision ────────────────────
  if (!rawText.trim()) {
    if (pageImages.length === 0) return [];
    return parseViaVision(pageImages, images);
  }

  // ── Text-based PDF → use Claude text extraction (existing path) ───────────
  let fullText = "";
  const stream = await anthropic.messages.stream({
    model:      "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{
      role: "user",
      content: `You are a tile stock data extractor for an Indian tiles business.
Extract EVERY tile/product item from the PDF text below.

The PDF may use one of three layouts — detect which one applies and parse accordingly:

LAYOUT A — Stanza format (dimension-prefixed names, e.g. "800X2400 SHREEM ELEGANT WHITE"):
  • Each item line starts with a dimension (e.g. "600X1200") or brand name.
  • Section headers like "SHREEM (1PCS) (FULLBODY)" are NOT items — skip them.
  • The numbers after each item are: box count, then pieces count.
  • boxCount = boxes in stock.

LAYOUT B — Columnar table format (headers: NO / DESIGN / ITEM NAME / SIZE / STOCK(BOX) / BOOKING / BALANCE(BOX) / NO PCS/BOX):
  • Each row has a sequential row number, optional design tag like "(NEW)", item name, size, stock, booking, balance, pcs.
  • boxCount = BALANCE(BOX) column (NOT the STOCK(BOX) column).
  • pcsCount = NO PCS/BOX column.
  • Design tags like "(NEW)", "(MIXED BATCH)" are NOT part of the tile name — strip them.

LAYOUT C — Three-column visual layout (columns: ITEM | BOX | DESIGN):
  • The page header has columns labeled ITEM, BOX, DESIGN (and sometimes RATE).
  • The text is extracted row-by-row based on Y position. Large horizontal gaps in a line indicate column boundaries.
  • Section/category headers like "1200X600 GLOSSY", "1200X600 MATT", "300x600", "800X1200", "1800X1200 GLOSSY PATHIRIPALA", "1200X600 LAMINATED WOOD", "1200X600 CARVING MATT", "600X600" etc. are dividers — NOT items. Skip them.
  • Sub-depot markers like "MALAPPURAM-CHEMMANIYODE DEPO." indicate a location change for items that follow. Record that location for those items.
  • Each tile item occupies a BLOCK of 2–4 consecutive lines:
      Line 1: size + brand name  (e.g. "600X1200 LORENZO")
      Line 2: rest of name       (e.g. "MANGUS WHITE -")
      Line 3: finish             (e.g. "GLOSSY")
    Join all lines of the block to form the full tileName.
  • The BOX value (a number like 982.1 or 141, or text like "DISPATCHED ON 07-07") appears on THE SAME LINE as one of the item's lines, separated by large spaces.
    It can appear on line 1, line 2, or line 3 of the item block — whichever line is vertically centred beside the block.
    Example extracted text:
      "600X1200 LORENZO"
      "MANGUS WHITE -         982.1"   ← boxCount is 982.1 here
      "GLOSSY"
    Another example:
      "1200X600 ROCO"                  ← here the number is on line 1
      "141"
      "ETRO SMOKE IVORY-"
      "GLOSSY"
    In both cases 982.1 / 141 is the boxCount for that item.
  • A bare number on a line by itself (no item text) belongs to the item block immediately above or below it.
  • "DISPATCHED ON ..." anywhere in the item block means boxCount = 0.
  • Rate/price values (e.g. "400", "500", "70/PC", "50/PCS", "34.10 RS/SQ.FT") are in the RATE column (far right) — ignore them for boxCount.
    Tell apart: a rate value is followed by "/PC", "/PCS", "RS/SQ.FT", or appears alongside an "RS" label; a boxCount is just a plain integer or decimal (e.g. 48, 122.1).
  • Pieces-per-box hints like "(5PCS)", "(6PCS)", "(7PCS)" embedded in the tile name → pcsCount = that number.
  • Adhesive/grout/epoxy products (EPOXY, TILE ADHESIVE, GEL, GLASS BOND, etc.) ARE valid items. Their box count is 0 if no number is shown.
  • Square-footage notes like "(20.67 SQFT PER BOX)" are not box counts — skip.

Common rules for all layouts:
  • Return ONLY a raw JSON array — NO markdown fences, NO explanation, NO pretty-printing.
  • Output each JSON object on a SINGLE LINE with no internal newlines or extra spaces.
    Example of correct compact format:
    [{"tileName":"600X1200 LORENZO MANGUS WHITE GLOSSY","brand":"LORENZO","size":"600X1200","finish":"GLOSSY","boxCount":982.1,"pcsCount":null,"location":null},{"tileName":"...","brand":"...","size":"...","finish":"...","boxCount":0,"pcsCount":null,"location":null}]
  • Each element must have exactly these fields (no others, in this order):
      "tileName" : full assembled tile name (size + brand + model + finish joined with spaces, cleaned up)
      "brand"    : brand name only (e.g. "KAG", "SHREEM", "MOZILLA", "LORENZO", "AVALTA") or null
      "size"     : dimension string (e.g. "800X2400", "1200X1800", "600X600") or null
      "finish"   : finish type (GLOSSY, MATT, FULLBODY, NANO, RUSTIC, CARVING, LAPATO, LAMINATED, etc.) or null
      "boxCount" : number — boxes in stock (0 if none or dispatched, never null)
      "pcsCount" : integer pieces per box or null
      "location" : sub-depot/location name if a location marker appeared above this item, otherwise null
  • Include ALL items, even those with 0 or negative box counts.
  • Skip pure column headers, section/size category headers, footer lines, email addresses, date lines, page numbers.
  • Adhesive/gum products ARE valid items — include them with boxCount 0 if no quantity shown.
  • boxCount and pcsCount must be numbers (not strings).

PDF text:
${rawText}`,
    }],
  });

  // Collect streamed chunks into a single string
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
    }
  }

  const parsed = extractJsonArray(fullText);
  if (!parsed) return [];

  let typedParsed: Record<string, unknown>[];
  try {
    typedParsed = parsed as Record<string, unknown>[];
  } catch {
    return [];
  }

  return typedParsed
    .map((item, i) => ({
      tileName:  String(item.tileName  ?? "").trim(),
      brand:     item.brand   ? String(item.brand).trim()   : null,
      size:      item.size    ? String(item.size).trim()    : null,
      finish:    item.finish  ? String(item.finish).trim()  : null,
      boxCount:  item.boxCount  != null ? Number(item.boxCount)  : null,
      pcsCount:  item.pcsCount  != null ? Number(item.pcsCount)  : null,
      imageData: images[i]?.b64 ?? null,
      location:  item.location ? String(item.location).trim() : null,
    }))
    .filter(item => item.tileName.length > 0);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/uploads
router.get("/", async (req, res) => {
  try {
    const depotId = req.query.depotId ? parseInt(req.query.depotId as string, 10) : null;
    const limit   = Math.min(100, parseInt((req.query.limit as string) || "20", 10));

    const rows = await db
      .select({
        id:             uploadsTable.id,
        depotId:        uploadsTable.depotId,
        depotName:      depotsTable.name,
        filename:       uploadsTable.filename,
        status:         uploadsTable.status,
        itemsExtracted: uploadsTable.itemsExtracted,
        errorMessage:   uploadsTable.errorMessage,
        stockDate:      uploadsTable.stockDate,
        createdAt:      uploadsTable.createdAt,
        completedAt:    uploadsTable.completedAt,
      })
      .from(uploadsTable)
      .innerJoin(depotsTable, eq(depotsTable.id, uploadsTable.depotId))
      .where(depotId && !isNaN(depotId) ? eq(uploadsTable.depotId, depotId) : undefined)
      .orderBy(desc(uploadsTable.createdAt))
      .limit(limit);

    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list uploads");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/uploads (multipart) — admin only
router.post("/", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "PDF file is required" });
  }

  const depotId = parseInt(req.body.depotId, 10);
  if (isNaN(depotId)) {
    return res.status(400).json({ error: "depotId is required" });
  }

  const stockDate: string | null = req.body.stockDate || null;

  const [depot] = await db.select().from(depotsTable).where(eq(depotsTable.id, depotId));
  if (!depot) {
    return res.status(400).json({ error: "Depot not found" });
  }

  const [uploadRecord] = await db
    .insert(uploadsTable)
    .values({ depotId, filename: req.file.originalname, status: "processing", stockDate })
    .returning();

  res.status(201).json({ ...uploadRecord, depotName: depot.name });

  const fileBuffer = req.file.buffer;
  const uploadId   = uploadRecord.id;
  const log        = req.log;

  void (async () => {
    try {
      const items = await parsePdf(fileBuffer);

      if (items.length === 0) {
        await db.update(uploadsTable)
          .set({ status: "failed", errorMessage: "No stock items could be extracted from the PDF", completedAt: new Date() })
          .where(eq(uploadsTable.id, uploadId));
        return;
      }

      await db.delete(stockItemsTable).where(eq(stockItemsTable.depotId, depotId));

      const toInsert = items.map((item) => ({
        depotId,
        uploadId,
        tileName:  item.tileName,
        brand:     item.brand,
        size:      item.size,
        finish:    item.finish,
        boxCount:  item.boxCount !== null ? String(item.boxCount) : null,
        pcsCount:  item.pcsCount !== null ? String(item.pcsCount) : null,
        stockDate,
        imageData: item.imageData ?? null,
        location:  item.location  ?? null,
      }));

      for (let i = 0; i < toInsert.length; i += 100) {
        await db.insert(stockItemsTable).values(toInsert.slice(i, i + 100));
      }

      await db.update(uploadsTable)
        .set({ status: "done", itemsExtracted: items.length, completedAt: new Date() })
        .where(eq(uploadsTable.id, uploadId));
    } catch (err) {
      log.error({ err }, "PDF processing failed");
      await db.update(uploadsTable)
        .set({ status: "failed", errorMessage: err instanceof Error ? err.message : "Processing failed", completedAt: new Date() })
        .where(eq(uploadsTable.id, uploadId));
    }
  })();

  return;
});

// GET /api/uploads/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [row] = await db
      .select({
        id:             uploadsTable.id,
        depotId:        uploadsTable.depotId,
        depotName:      depotsTable.name,
        filename:       uploadsTable.filename,
        status:         uploadsTable.status,
        itemsExtracted: uploadsTable.itemsExtracted,
        errorMessage:   uploadsTable.errorMessage,
        stockDate:      uploadsTable.stockDate,
        createdAt:      uploadsTable.createdAt,
        completedAt:    uploadsTable.completedAt,
      })
      .from(uploadsTable)
      .innerJoin(depotsTable, eq(depotsTable.id, uploadsTable.depotId))
      .where(eq(uploadsTable.id, id));

    if (!row) return res.status(404).json({ error: "Upload not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to get upload");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
