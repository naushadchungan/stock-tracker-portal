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

// ── Python script ────────────────────────────────────────────────────────────
// Extracts raw text + parses all tile items + captures images from the PDF.
// Returns { items, text, images }.
// TypeScript uses items directly; falls back to Claude if count is too low.
const PYTHON_SCRIPT = `
import fitz
import json
import sys
import re
import base64

BRANDS = sorted([
    'L-TILE','ONE TOUCH','SHREEM','MOZILLA','SUZORA','BEETHAS','SPEROX',
    'ANTONOVA','LIMONZA','LATTO','AARAV','SOLOGRIS','SOLOGRES','MIRACLE',
    'MILLO','ROCO','AVALTA','TOSSA','NERISS','LORENZO','ALIVE','SCIENTIFICA',
    'VEGA','ORIK','SKYPE','IYOTA','GRENIC','FRENIS','MURANO','SUNRAJ',
    'LACTOSE','SOLOSTONE','MARBILANO','STATUS','MILLENNIUM','LIVOLLA',
    'MONOLITH','NOKEN','PARCOS','LV','ROTON','DIOR',
    'BLUEGRESS','GEOGRESS','ROCK','DONATO','CORAL','METRO','ROLLZA',
    'ROLLANCE','ROLLSTAR','CEVIC','KAMRON','SANFORD','SOLOREX','ICOLUX',
    'LAXVEER','ORIANA','ORINDA','PENGVIN','ROCART','VIZOLI','TORINO',
    'CAVOS','FUSION','GRAYSTONE','EXOTICA','TAURUS','PASSION','CIBELA',
    'KAG','SOLO','NEVADA','CRESTO','FORTUNE','NEXUS','OPULUX','KRESTO',
    'LEMZON','LAVIT','BLUESTONE','NITCO','SOMANY','KAJARIA','JOHNSON',
    'RAK','SIMPOLO','SIMONZA','AXOR','VELBON','CASA','KIVOS','SPENTAGON',
    'FRITA','MILLION','LOREM','SUNFIELD','VARG','PASSERO','KSTONE','EVOK',
    'GRACE','NOVENA','CASAGRES','EUROTILE','ROYALE','ATLAS',
], key=len, reverse=True)

SECTION_RE  = re.compile(r'\\(\\s*\\d+\\s*PCS\\s*\\)', re.IGNORECASE)
DIM_TILE_RE = re.compile(r'^\\d{1,4}\\s*[Xx]\\s*\\d{1,4}\\s+\\S')
NUM_RE      = re.compile(r'^\\d+(\\.\\d+)?\\s*$')
DIM_ONLY_RE = re.compile(r'^\\(?\\s*\\d{1,4}\\s*[Xx]\\s*\\d{1,4}\\s*\\)?$', re.IGNORECASE)
DIM_EXTRACT = re.compile(r'(\\d{1,4})\\s*[Xx]\\s*(\\d{1,4})', re.IGNORECASE)
FINISH_RE   = re.compile(
    r'\\b(GLOSSY|MATT|MATTE|POLISHED|FULLBODY|FULL\\s*BODY|HIGH\\s*GLOSSY|'
    r'HI\\s*GLOSSY|NANO|CARVING|COLOUR\\s*BODY|SEMI\\s*HIGH\\s*GLOSSY|'
    r'PUNCH\\s*MATT|SUPER\\s*HG|ENDLESS|LAPATO|SATIN|SUGAR|RUSTIC)\\b',
    re.IGNORECASE
)
SKIP_RE = re.compile(
    r'(DESPATCH|DISPATCH|^ITEM\\s+NAME$|^BOX$|^PCS$|^DESIGN$|^STOCK\\s+LIST$|'
    r'^\\($|^\\)$|^-+$|^=+$)',
    re.IGNORECASE
)

def extract_brand(name):
    up = name.upper()
    for b in BRANDS:
        if re.search(r'\\b' + re.escape(b) + r'\\b', up):
            return b
    return None

def starts_tile(line):
    if DIM_TILE_RE.match(line):
        return True
    up = line.upper()
    for b in BRANDS:
        if up.startswith(b + ' ') or up.startswith(b + '-'):
            return True
    return False

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

def parse_stock_text(text):
    items     = []
    cur_name  = None
    cur_extra = []
    cur_box   = None
    cur_pcs   = None

    def flush():
        nonlocal cur_name, cur_extra, cur_box, cur_pcs
        if cur_name and cur_box is not None:
            full   = re.sub(r'\\s+', ' ', cur_name).strip()
            m      = DIM_EXTRACT.search(full)
            size   = (m.group(1) + 'X' + m.group(2)).upper() if m else None
            fm     = FINISH_RE.search(full)
            finish = fm.group(0).upper() if fm else None
            if not finish:
                for ex in cur_extra:
                    fm = FINISH_RE.search(ex)
                    if fm:
                        finish = fm.group(0).upper()
                        break
            items.append({
                'tileName':  full,
                'brand':     extract_brand(full),
                'size':      size,
                'finish':    finish,
                'boxCount':  cur_box,
                'pcsCount':  cur_pcs,
                'imageData': None,
                'location':  None,
            })
        cur_name = None
        cur_extra.clear()
        cur_box = cur_pcs = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if SKIP_RE.search(line):
            continue
        if DIM_ONLY_RE.match(line):
            continue
        if SECTION_RE.search(line):
            flush()
            continue
        if NUM_RE.match(line):
            if cur_name is not None:
                n = int(float(line))
                if cur_box is None:
                    cur_box = n
                elif cur_pcs is None:
                    cur_pcs = n
            continue
        if starts_tile(line):
            flush()
            cur_name  = line
            cur_extra = []
            cur_box   = cur_pcs = None
            continue
        if cur_name is not None:
            if line.startswith('('):
                cur_extra.append(line)
            elif len(line) > 2 and not NUM_RE.match(line):
                cur_name += ' ' + line

    flush()
    return items

if __name__ == '__main__':
    path     = sys.argv[1]
    out_path = sys.argv[2]
    doc      = fitz.open(path)

    all_text   = []
    all_images = []

    for page_num in range(doc.page_count):
        page = doc[page_num]
        all_text.append(page.get_text('text'))
        for img in get_tile_images(page, doc):
            img['page'] = page_num
            all_images.append(img)

    doc.close()

    full_text = '\\n'.join(all_text)
    items     = parse_stock_text(full_text)

    with open(out_path, 'w') as f:
        json.dump({'items': items, 'text': full_text, 'images': all_images}, f)
`;

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Anthropic client (for fallback when Python parser gets < 10 items) ───────
const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
});

// ── Main parser ──────────────────────────────────────────────────────────────
async function parsePdf(pdfBuffer: Buffer): Promise<ParsedItem[]> {
  const tmpId      = randomBytes(8).toString("hex");
  const pdfPath    = join(tmpdir(), `upload_${tmpId}.pdf`);
  const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);
  const outPath    = join(tmpdir(), `result_${tmpId}.json`);

  let pythonItems: ParsedItem[] = [];
  let rawText = "";
  let images: { b64: string; y: number; page: number }[] = [];

  try {
    await Promise.all([
      writeFile(pdfPath, pdfBuffer),
      writeFile(scriptPath, PYTHON_SCRIPT),
    ]);
    await execAsync(`python3 "${scriptPath}" "${pdfPath}" "${outPath}"`, { timeout: 120_000 });
    const raw = JSON.parse(await readFile(outPath, "utf8"));
    pythonItems = (raw.items  ?? []) as ParsedItem[];
    rawText     =  raw.text   ?? "";
    images      =  raw.images ?? [];
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(scriptPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);
  }

  const attachImages = (items: ParsedItem[]) =>
    items.map((item, i) => ({
      tileName:  String(item.tileName  ?? "").trim(),
      brand:     item.brand   ? String(item.brand).trim()   : null,
      size:      item.size    ? String(item.size).trim()    : null,
      finish:    item.finish  ? String(item.finish).trim()  : null,
      boxCount:  item.boxCount  != null ? Number(item.boxCount)  : null,
      pcsCount:  item.pcsCount  != null ? Number(item.pcsCount)  : null,
      imageData: images[i]?.b64 ?? null,
      location:  item.location ? String(item.location).trim() : null,
    })).filter(item => item.tileName.length > 0);

  // Python parser got a good count — use it directly (fast, no AI cost)
  if (pythonItems.length >= 10) {
    return attachImages(pythonItems);
  }

  // Fallback: send raw text to Claude for unusual/complex PDF formats
  if (!rawText.trim()) return attachImages(pythonItems);

  try {
    const message = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `You are a tile stock data extractor for an Indian tiles warehouse.
Extract EVERY tile/product item from the stock list text below.

Return ONLY a valid JSON array (no markdown fences, no explanation).
Each element must have exactly these fields:
  "tileName"  : full name including size prefix (e.g. "800X2400 SHREEM ELEGANT WHITE")
  "brand"     : brand name only or null
  "size"      : dimension string (e.g. "800X2400", "4X2") or null
  "finish"    : finish type (GLOSSY, MATT, FULLBODY, etc.) or null
  "boxCount"  : integer boxes in stock (0 if out of stock, never null)
  "pcsCount"  : integer pieces or null
  "location"  : location string or null

Rules:
- Include ALL items, even those with 0 boxes.
- Section headers like "SHREEM (1PCS) (FULLBODY)" are NOT items — skip.
- "(DESPATCH DATE : ...)" lines are NOT items — skip.
- Adhesive products (e.g. "MIRACLE GUM") ARE valid items — include.
- Join wrapped tile names with a space.

PDF text:
${rawText}`,
      }],
    });

    const block = message.content[0];
    if (block.type !== "text") return attachImages(pythonItems);

    // Robustly extract JSON array even if Claude adds preamble text
    const jsonMatch = block.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return attachImages(pythonItems);

    const claudeItems = JSON.parse(jsonMatch[0]) as ParsedItem[];
    if (!Array.isArray(claudeItems) || claudeItems.length === 0) return attachImages(pythonItems);
    return attachImages(claudeItems);
  } catch {
    return attachImages(pythonItems);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

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

      // Delete existing stock for this depot and replace
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
