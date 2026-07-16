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
import base64

# ── shared helpers ──────────────────────────────────────────────────────────
DIMENSION_RE = re.compile(r'\\b\\d+\\s*[Xx]\\s*\\d+\\b')
FINISH_RE    = re.compile(r'\\b(GLOSSY|MATT|POSH|ENDLESS GLOSSY|ENDLESS|HI GLOSSY|SILK|CARVING|CRV)\\b', re.IGNORECASE)
BRANDS = [
    'SHREEM','MOZILLA','MILLO','ROCO','AVALTA','TOSSA','BLUEGRESS','GEOGRESS',
    'MONOLITH','ROCK','SOLO','NERISS','LORENZO','ALIVE','NEVADA','CRESTO',
    'FORTUNE','NEXUS','OPULUX','KAG','KRESTO','LEMZON','LAVIT','ONE TOUCH',
    'BLUESTONE','NITCO','SOMANY','KAJARIA','JOHNSON','RAK','SIMPOLO',
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

def make_tile(name, box_count, pcs_count=None, image_data=None):
    name = re.sub(r'\\s+', ' ', name).strip()
    return {
        'tileName': name,
        'brand': extract_brand(name),
        'size': extract_size(name),
        'finish': extract_finish(name),
        'boxCount': box_count,
        'pcsCount': pcs_count,
        'imageData': image_data,
    }

# ── PDF type detection ───────────────────────────────────────────────────────
def has_text(doc):
    for i in range(min(5, doc.page_count)):
        if doc[i].get_text('text').strip():
            return True
    return False

# ── image extraction (shared by both parsers) ────────────────────────────────
# min_w/min_h: skip tiny decoration; max_w/max_h: skip full-page scans & logos
def extract_page_images(page, doc, min_w=80, min_h=60, max_w=380, max_h=380):
    images = []
    try:
        seen = set()
        for info in page.get_images(full=True):
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                rects = page.get_image_rects(xref)
                if not rects:
                    continue
                rect = rects[0]
                w, h = rect.width, rect.height
                if w < min_w or h < min_h:
                    continue
                if w > max_w or h > max_h:
                    continue
                img_dict = doc.extract_image(xref)
                if not img_dict or not img_dict.get('image'):
                    continue
                raw = img_dict['image']
                if len(raw) > 600000:
                    continue
                images.append({
                    'b64': base64.b64encode(raw).decode('utf-8'),
                    'y': rect.y0,
                    'x': rect.x0,
                })
            except Exception:
                pass
    except Exception:
        pass
    images.sort(key=lambda i: (round(i['y'] / 150) * 150, i['x']))
    return images

# ── text-based parser ────────────────────────────────────────────────────────
BOX_NUM_RE = re.compile(r'^[\\d]+\\.?\\d*\\s*(BOX)?$', re.IGNORECASE)
NIL_RE     = re.compile(r'^nil$', re.IGNORECASE)
SKIP_PAT   = re.compile(
    r'^(item\\s+name|name|box|pcs|design|stock\\s+list|epoxy|adhesive|topkrete|'
    r'cp\\s+water|millennium|dispatched|despatch|plain\\s+colour)',
    re.IGNORECASE
)
TRIVIAL_CATS = {
    '1200X600 GLOSSY','1200X600 MATT','600X1200 GLOSSY','800X2400','1600X800',
    '600X600','1800X1200','800X800','600X600 GLOSSY','600X600 MATT',
    '1800X1200 GLOSSY','1600X800 GLOSSY','1600X800 MATT'
}

def parse_text_pdf(doc):
    results = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        page_tiles = []
        blocks = sorted(page.get_text('blocks'), key=lambda b: (round(b[1]/40)*40, b[0]))
        cur_name = []
        cur_box  = None
        cur_pcs  = None

        def flush():
            nonlocal cur_name, cur_box, cur_pcs
            if cur_name and cur_box is not None:
                name = ' '.join(cur_name)
                if len(name) > 5 and DIMENSION_RE.search(name):
                    page_tiles.append(make_tile(name, cur_box, cur_pcs))
            cur_name, cur_box, cur_pcs = [], None, None

        for b in blocks:
            for line in b[4].split('\\n'):
                line = line.strip()
                if not line or SKIP_PAT.match(line) or line.upper() in TRIVIAL_CATS:
                    continue
                if re.match(r'^[\\(\\)\\[\\]]+$', line):
                    continue
                if NIL_RE.match(line):
                    if cur_name:
                        if cur_box is None: cur_box = 0.0
                        elif cur_pcs is None: cur_pcs = 0.0
                elif BOX_NUM_RE.match(line) and not DIMENSION_RE.search(line):
                    try: num = float(re.sub(r'[^\\d.]', '', line))
                    except: num = 0.0
                    if cur_name:
                        if cur_box is None: cur_box = num
                        elif cur_pcs is None: cur_pcs = num
                elif DIMENSION_RE.search(line):
                    flush()
                    cur_name = [line]
                    cur_box = cur_pcs = None
                else:
                    if cur_name and len(line) > 2 and not re.match(r'^\\d+$', line):
                        cur_name.append(line)

        flush()
        imgs = extract_page_images(page, doc)
        for i, tile in enumerate(page_tiles):
            if i < len(imgs):
                tile['imageData'] = imgs[i]['b64']
        results.extend(page_tiles)
    return results

# ── OCR-based parser (image/scanned PDFs) ────────────────────────────────────
OCR_BOX_RE   = re.compile(r'^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+BOX\\s*$', re.IGNORECASE)
OCR_OOS_RE   = re.compile(r'^(.+?)\\s+OUT\\s+OF\\s+STOCK\\s*$', re.IGNORECASE)
OCR_NOISE_RE = re.compile(r'^[^A-Za-z0-9]{0,2}$|^[\\W_]{3,}$')

def parse_ocr_page(text):
    tiles = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or OCR_NOISE_RE.match(line):
            continue
        line = re.sub(r'^[^A-Z0-9]+', '', line, flags=re.IGNORECASE).strip()
        if not line:
            continue
        m = OCR_BOX_RE.match(line)
        if m:
            name, count = m.group(1).strip(), float(m.group(2))
            if len(name) >= 3:
                tiles.append(make_tile(name, count))
            continue
        m = OCR_OOS_RE.match(line)
        if m:
            name = m.group(1).strip()
            if len(name) >= 3:
                tiles.append(make_tile(name, 0.0))
    return tiles

def parse_ocr_pdf(doc):
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return []
    results = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        if not page.get_images(full=True):
            continue
        # OCR the full page for tile names / box counts
        mat = fitz.Matrix(3, 3)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        img = Image.frombytes('L', [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(img, config='--psm 4')
        page_tiles = parse_ocr_page(text)
        # Extract embedded tile thumbnail images from the page
        imgs = extract_page_images(page, doc)
        for i, tile in enumerate(page_tiles):
            if i < len(imgs):
                tile['imageData'] = imgs[i]['b64']
        results.extend(page_tiles)
    return results

# ── entry point ──────────────────────────────────────────────────────────────
def parse_pdf(path):
    doc = fitz.open(path)
    if has_text(doc):
        items = parse_text_pdf(doc)
    else:
        items = parse_ocr_pdf(doc)
    doc.close()
    return items

if __name__ == '__main__':
    path     = sys.argv[1]
    out_path = sys.argv[2]
    items    = parse_pdf(path)
    with open(out_path, 'w') as f:
        json.dump(items, f)
`;

async function parsePdf(pdfBuffer: Buffer): Promise<Array<{
  tileName: string;
  brand: string | null;
  size: string | null;
  finish: string | null;
  boxCount: number | null;
  pcsCount: number | null;
  imageData: string | null;
}>> {
  const tmpId = randomBytes(8).toString("hex");
  const pdfPath = join(tmpdir(), `upload_${tmpId}.pdf`);
  const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);
  const outPath = join(tmpdir(), `result_${tmpId}.json`);

  try {
    await Promise.all([
      writeFile(pdfPath, pdfBuffer),
      writeFile(scriptPath, PYTHON_SCRIPT),
    ]);
    await execAsync(`python3 "${scriptPath}" "${pdfPath}" "${outPath}"`, { timeout: 300000 });
    const raw = await readFile(outPath, "utf8");
    return JSON.parse(raw);
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(scriptPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
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
    .values({ depotId, filename: req.file.originalname, status: "processing", stockDate })
    .returning();

  res.status(201).json({ ...uploadRecord, depotName: depot.name });

  const fileBuffer = req.file.buffer;
  const uploadId = uploadRecord.id;
  const log = req.log;

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
        tileName: item.tileName,
        brand: item.brand,
        size: item.size,
        finish: item.finish,
        boxCount: item.boxCount !== null ? String(item.boxCount) : null,
        pcsCount: item.pcsCount !== null ? String(item.pcsCount) : null,
        stockDate,
        imageData: item.imageData,
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
