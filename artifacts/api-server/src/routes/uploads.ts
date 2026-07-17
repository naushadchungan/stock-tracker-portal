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

// Python script: extracts raw text + tile images from PDF, nothing more.
// All structured parsing is handled by Claude in parsePdf() below.
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
            if w < 60 or h < 40:
                continue
            if w > 300 or h > 300:
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

if __name__ == '__main__':
    path     = sys.argv[1]
    out_path = sys.argv[2]
    doc      = fitz.open(path)

    pages_text = []
    all_images = []

    for page_num in range(doc.page_count):
        page = doc[page_num]
        pages_text.append(page.get_text('text'))
        for img in get_tile_images(page, doc):
            img['page'] = page_num
            all_images.append(img)

    doc.close()

    with open(out_path, 'w') as f:
        json.dump({'text': '\\n'.join(pages_text), 'images': all_images}, f)
`;

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

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
});

async function parsePdf(pdfBuffer: Buffer): Promise<ParsedItem[]> {
  const tmpId      = randomBytes(8).toString("hex");
  const pdfPath    = join(tmpdir(), `upload_${tmpId}.pdf`);
  const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);
  const outPath    = join(tmpdir(), `result_${tmpId}.json`);

  let rawText  = "";
  let images:  { b64: string; y: number; page: number }[] = [];

  try {
    await Promise.all([
      writeFile(pdfPath, pdfBuffer),
      writeFile(scriptPath, PYTHON_SCRIPT),
    ]);
    await execAsync(`python3 "${scriptPath}" "${pdfPath}" "${outPath}"`, { timeout: 120_000 });
    const raw = JSON.parse(await readFile(outPath, "utf8"));
    rawText  = raw.text   ?? "";
    images   = raw.images ?? [];
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(scriptPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);
  }

  if (!rawText.trim()) return [];

  // Ask Claude to extract every tile item from the raw PDF text
  const message = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{
      role: "user",
      content: `You are a tile stock data extractor for an Indian tiles warehouse.
Extract EVERY tile/product item from the stock list text below.

Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
Each element must have exactly these fields:
  "tileName"  : full name as it appears (include size prefix, e.g. "800X2400 SHREEM ELEGANT WHITE")
  "brand"     : brand name only (e.g. "SHREEM", "MOZILLA", "SUZORA") or null
  "size"      : dimension string (e.g. "800X2400", "4X2", "2X2", "300X600") or null
  "finish"    : finish type (e.g. "GLOSSY", "MATT", "FULLBODY", "HIGH GLOSSY", "NANO") or null
  "boxCount"  : integer number of boxes (0 if out of stock, never null)
  "pcsCount"  : integer pieces or null
  "location"  : location if mentioned or null

Rules:
- Include ALL items — even those with 0 boxes.
- Section/category headers like "SHREEM (1PCS) (FULLBODY)" or "SUZORA (2 PCS) (SUPER HG)" are NOT items — skip them.
- "(DESPATCH DATE : ...)" lines are NOT items — skip them.
- Adhesive / gum products like "MIRACLE GUM MB-100" ARE valid items — include them.
- If a tile name wraps across two lines, join them with a space.
- boxCount and pcsCount must be integers (round if needed).

PDF text:
${rawText}`,
    }],
  });

  const block = message.content[0];
  if (block.type !== "text") return [];

  let parsed: ParsedItem[];
  try {
    // Strip accidental markdown fences if Claude adds them
    const jsonText = block.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
  } catch {
    return [];
  }

  // Attach images in order (Python sorted them top-to-bottom per page)
  return parsed.map((item, i) => ({
    tileName:  String(item.tileName ?? "").trim(),
    brand:     item.brand  ? String(item.brand).trim()  : null,
    size:      item.size   ? String(item.size).trim()   : null,
    finish:    item.finish ? String(item.finish).trim() : null,
    boxCount:  item.boxCount  != null ? Number(item.boxCount)  : null,
    pcsCount:  item.pcsCount  != null ? Number(item.pcsCount)  : null,
    imageData: images[i]?.b64 ?? null,
    location:  item.location ? String(item.location).trim() : null,
  })).filter(item => item.tileName.length > 0);
}

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
        location:  item.location ?? null,
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
