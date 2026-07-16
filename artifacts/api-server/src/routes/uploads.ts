import { Router } from "express";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { db } from "@workspace/db";
import { uploadsTable, stockItemsTable, depotsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

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

const PYTHON_SCRIPT = `
import fitz
import json
import sys
import re

DIMENSION_RE = re.compile(r'\\b\\d+\\s*[Xx]\\s*\\d+\\b')
BOX_NUM_RE = re.compile(r'^[\\d]+\\.?\\d*\\s*(BOX)?$', re.IGNORECASE)
NIL_RE = re.compile(r'^nil$', re.IGNORECASE)
FINISH_RE = re.compile(r'\\b(GLOSSY|MATT|POSH|ENDLESS GLOSSY|ENDLESS|HI GLOSSY)\\b', re.IGNORECASE)
SKIP_PAT = re.compile(
    r'^(item\\s+name|name|box|pcs|design|stock\\s+list|epoxy|adhesive|topkrete|cp\\s+water|millennium|dispatched|despatch|plain\\s+colour)',
    re.IGNORECASE
)
TRIVIAL_CATS = {
    '1200X600 GLOSSY','1200X600 MATT','600X1200 GLOSSY','800X2400','1600X800',
    '600X600','1800X1200','800X800','600X600 GLOSSY','600X600 MATT',
    '1800X1200 GLOSSY','1600X800 GLOSSY','1600X800 MATT'
}
BRANDS = [
    'SHREEM','MOZILLA','MILLO','ROCO','AVALTA','TOSSA','BLUEGRESS','GEOGRESS',
    'MONOLITH','ROCK','SOLO','NERISS','LORENZO','ALIVE','NEVADA','CRESTO',
    'FORTUNE','NEXUS','OPULUX','KAG'
]

def extract_brand(name):
    up = name.upper()
    for b in BRANDS:
        if b in up:
            return b
    return None

def extract_size(name):
    m = DIMENSION_RE.search(name)
    return m.group(0).replace(' ','').upper() if m else None

def extract_finish(name):
    m = FINISH_RE.search(name)
    return m.group(0).upper() if m else None

def parse_pdf(path):
    doc = fitz.open(path)
    results = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        blocks = sorted(page.get_text("blocks"), key=lambda b: (round(b[1]/40)*40, b[0]))
        current_name_parts = []
        current_box = None
        current_pcs = None

        def save_current():
            nonlocal current_name_parts, current_box, current_pcs
            if current_name_parts and current_box is not None:
                name = re.sub(r'\\s+', ' ', ' '.join(current_name_parts)).strip()
                if len(name) > 5 and DIMENSION_RE.search(name):
                    results.append({
                        'tileName': name,
                        'brand': extract_brand(name),
                        'size': extract_size(name),
                        'finish': extract_finish(name),
                        'boxCount': current_box,
                        'pcsCount': current_pcs,
                    })

        for b in blocks:
            text = b[4].strip()
            if not text:
                continue
            lines = [l.strip() for l in text.split('\\n') if l.strip()]
            for line in lines:
                if SKIP_PAT.match(line) or line.upper() in TRIVIAL_CATS:
                    continue
                if re.match(r'^[\\(\\)\\[\\]]+$', line):
                    continue
                is_box = BOX_NUM_RE.match(line) and not DIMENSION_RE.search(line)
                is_nil = NIL_RE.match(line)
                if is_nil:
                    if current_name_parts:
                        if current_box is None:
                            current_box = 0.0
                        elif current_pcs is None:
                            current_pcs = 0.0
                elif is_box:
                    try:
                        num_val = float(re.sub(r'[^\\d.]', '', line))
                    except Exception:
                        num_val = 0.0
                    if current_name_parts:
                        if current_box is None:
                            current_box = num_val
                        elif current_pcs is None:
                            current_pcs = num_val
                elif DIMENSION_RE.search(line):
                    save_current()
                    current_name_parts = [line]
                    current_box = None
                    current_pcs = None
                else:
                    if current_name_parts and len(line) > 2 and not re.match(r'^\\d+$', line):
                        current_name_parts.append(line)

        save_current()

    doc.close()
    return results

if __name__ == '__main__':
    path = sys.argv[1]
    items = parse_pdf(path)
    print(json.dumps(items))
`;

async function parsePdf(pdfBuffer: Buffer): Promise<Array<{
  tileName: string;
  brand: string | null;
  size: string | null;
  finish: string | null;
  boxCount: number | null;
  pcsCount: number | null;
}>> {
  const tmpId = randomBytes(8).toString("hex");
  const pdfPath = join(tmpdir(), `upload_${tmpId}.pdf`);
  const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);

  try {
    await Promise.all([
      writeFile(pdfPath, pdfBuffer),
      writeFile(scriptPath, PYTHON_SCRIPT),
    ]);
    const { stdout } = await execAsync(`python3 "${scriptPath}" "${pdfPath}"`, { timeout: 60000 });
    return JSON.parse(stdout.trim());
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(scriptPath).catch(() => {}),
    ]);
  }
}

// GET /api/uploads
router.get("/", async (req, res) => {
  try {
    const depotId = req.query.depotId ? parseInt(req.query.depotId as string, 10) : null;
    const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));

    const rows = await db
      .select({
        id: uploadsTable.id,
        depotId: uploadsTable.depotId,
        depotName: depotsTable.name,
        filename: uploadsTable.filename,
        status: uploadsTable.status,
        itemsExtracted: uploadsTable.itemsExtracted,
        errorMessage: uploadsTable.errorMessage,
        stockDate: uploadsTable.stockDate,
        createdAt: uploadsTable.createdAt,
        completedAt: uploadsTable.completedAt,
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

// POST /api/uploads (multipart)
router.post("/", upload.single("file"), async (req, res) => {
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
    .values({
      depotId,
      filename: req.file.originalname,
      status: "processing",
      stockDate,
    })
    .returning();

  res.status(201).json({ ...uploadRecord, depotName: depot.name });

  // Background processing
  const fileBuffer = req.file.buffer;
  const uploadId = uploadRecord.id;
  const log = req.log;

  void (async () => {
    try {
      const items = await parsePdf(fileBuffer);

      if (items.length === 0) {
        await db
          .update(uploadsTable)
          .set({ status: "failed", errorMessage: "No stock items could be extracted from the PDF", completedAt: new Date() })
          .where(eq(uploadsTable.id, uploadId));
        return;
      }

      // Replace existing stock for this depot
      await db.delete(stockItemsTable).where(eq(stockItemsTable.depotId, depotId));

      const toInsert = items.map((item) => ({
        depotId,
        uploadId,
        tileName: item.tileName,
        brand: item.brand,
        size: item.size,
        finish: item.finish,
        boxCount: item.boxCount !== null ? String(item.boxCount) : null,
        pcsCount: item.pcsCount !== null ? String(item.pcsCount) : null,
        stockDate,
      }));

      for (let i = 0; i < toInsert.length; i += 100) {
        await db.insert(stockItemsTable).values(toInsert.slice(i, i + 100));
      }

      await db
        .update(uploadsTable)
        .set({ status: "done", itemsExtracted: items.length, completedAt: new Date() })
        .where(eq(uploadsTable.id, uploadId));
    } catch (err) {
      log.error({ err }, "PDF processing failed");
      await db
        .update(uploadsTable)
        .set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Processing failed",
          completedAt: new Date(),
        })
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
        id: uploadsTable.id,
        depotId: uploadsTable.depotId,
        depotName: depotsTable.name,
        filename: uploadsTable.filename,
        status: uploadsTable.status,
        itemsExtracted: uploadsTable.itemsExtracted,
        errorMessage: uploadsTable.errorMessage,
        stockDate: uploadsTable.stockDate,
        createdAt: uploadsTable.createdAt,
        completedAt: uploadsTable.completedAt,
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
