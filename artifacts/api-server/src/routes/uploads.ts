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

# ── brand list (longest-first for greedy matching) ───────────────────────────
BRANDS = sorted([
    # Stanza / SG depot brands
    'SHREEM','MOZILLA','MILLO','ROCO','AVALTA','TOSSA','NERISS','LORENZO',
    'ALIVE','SUZORA','BEETHAS','SPEROX','ANTONOVA','LIMONZA','LATTO','AARAV',
    'SOLOGRIS','SOLOGRES','L-TILE','ONE TOUCH','SCIENTIFICA','VEGA','ORIK',
    'SKYPE','IYOTA','GRENIC','FRENIS','MURANO','SUNRAJ','LACTOSE','SOLOSTONE',
    'MARBILANO','STATUS','MILLENNIUM','LIVOLLA','MONOLITH','NOKEN','PARCOS',
    'LV','ROTON','DIOR',
    # Trusto / BizTiletech depot brands
    'BLUEGRESS','GEOGRESS','ROCK','DONATO','CORAL','METRO','ROLLZA','ROLLANCE',
    'ROLLSTAR','CEVIC','KAMRON','SANFORD','SOLOREX','ICOLUX','LAXVEER',
    'ORIANA','ORINDA','PENGVIN','ROCART','VIZOLI','TORINO','CAVOS','FUSION',
    'GRAYSTONE','EXOTICA','TAURUS','PASSION','CIBELA','KAG','SOLO',
    # Legacy / generic brands
    'NEVADA','CRESTO','FORTUNE','NEXUS','OPULUX','KRESTO','LEMZON','LAVIT',
    'BLUESTONE','NITCO','SOMANY','KAJARIA','JOHNSON','RAK','SIMPOLO',
    'SIMONZA','AXOR','VELBON','CASA','KIVOS','SPENTAGON','FRITA','MILLION',
    'LOREM','SUNFIELD','VARG','PASSERO','KSTONE','EVOK','GRACE','NOVENA',
    'CASAGRES','EUROTILE','ROYALE','ATLAS',
], key=len, reverse=True)

DIMENSION_RE = re.compile(r'\\b(\\d{2,4})\\s*[Xx]\\s*(\\d{2,4})\\b')
# Matches a line that IS ONLY a dimension -- bare size-column value, e.g. '1200x1800'
PURE_DIM_RE  = re.compile(r'^[\\(\\[]?\\d{2,4}\\s*[Xx]\\s*\\d{2,4}[\\)\\]]?\\s*$')
FINISH_RE    = re.compile(
    r'\\b(GLOSSY|MATT|MATTE|POLISHED|POSH|ENDLESS GLOSSY|ENDLESS|'
    r'HI GLOSSY|HIGH GLOSSY|SILK|CARVING|CRV|LAPATO|NANO|SATIN|'
    r'NATURAL GLOSSY|SUGAR|RUSTIC|FULLBODY|FULL BODY|COLOUR BODY)\\b',
    re.IGNORECASE
)
CATEGORY_RE  = re.compile(r'^(\\d{2,4}\\s*[Xx]\\s*\\d{2,4})\\s+(.+)$')
TILE_BOX_RE  = re.compile(r'^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+BOX\\b', re.IGNORECASE)
TILE_OOS_RE  = re.compile(r'^(.+?)\\s+OUT\\s+OF\\s+STOCK\\b', re.IGNORECASE)
LOCATION_RE  = re.compile(r'\\b(RACK|SHELF|ROW|SECTION|AISLE)\\s*[:\\-]?\\s*([A-Z0-9\\-]+)', re.IGNORECASE)

def extract_brand(name):
    up = name.upper()
    for b in BRANDS:
        if re.search(r'\\b' + re.escape(b) + r'\\b', up):
            return b
    return None

def extract_size_from_name(name, fallback=None):
    m = DIMENSION_RE.search(name)
    if m:
        return (m.group(1) + 'X' + m.group(2)).upper()
    return fallback

def extract_finish_from_name(name, fallback=None):
    m = FINISH_RE.search(name)
    if m:
        return re.sub(r'\\s+', ' ', m.group(0)).upper()
    return fallback

def make_tile(name, box_count, pcs_count=None, image_data=None,
              current_size=None, current_finish=None, location=None):
    name   = re.sub(r'\\s+', ' ', name).strip()
    size   = extract_size_from_name(name) or current_size
    finish = extract_finish_from_name(name) or current_finish
    return {
        'tileName':  name,
        'brand':     extract_brand(name),
        'size':      size,
        'finish':    finish,
        'boxCount':  box_count,
        'pcsCount':  pcs_count,
        'imageData': image_data,
        'location':  location,
    }

def starts_with_brand(line):
    up = line.upper()
    for b in BRANDS:
        if up.startswith(b + ' ') or up.startswith(b + '-') or up == b:
            return True
    return False

# ── PDF type detection ───────────────────────────────────────────────────────
def has_text(doc):
    chars = 0
    for i in range(min(5, doc.page_count)):
        chars += len(doc[i].get_text('text').strip())
    return chars > 50

# ── tile photo extraction ────────────────────────────────────────────────────
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
                continue   # too small
            if w > 300 or h > 300:
                continue   # full-page scan / logo
            if r.x0 < page_w * 0.45:
                continue   # skip text-area images
            img_dict = doc.extract_image(xref)
            if not img_dict or not img_dict.get('image'):
                continue
            raw = img_dict['image']
            if len(raw) > 700000:
                continue
            images.append({'b64': base64.b64encode(raw).decode('utf-8'), 'y': r.y0})
        except Exception:
            pass
    images.sort(key=lambda i: i['y'])
    return images

# ── text-based parser ────────────────────────────────────────────────────────
BOX_NUM_RE = re.compile(r'^[\\d]+\\.?\\d*\\s*(BOX)?$', re.IGNORECASE)
NIL_RE     = re.compile(r'^nil$', re.IGNORECASE)
SKIP_PAT   = re.compile(
    r'^(item\\s+name|item|name|box|pcs|design|stock\\s+list|stock\\s+summary|'
    r'epoxy|adhesive|topkrete|cp\\s+water|miracle|sunflora|'
    r'dispatched\\s+on|despatch|\\(despatch|\\(dispatch|dispatched|'
    r's\\.n\\b|\\bimage\\b|quantity|product\\s+name|'
    r'no\\s+pcs|booking|balance\\b|biztiletech|'
    r'rate\\b|rs/sq|sqft|per\\s+box|'
    r'plain\\s+colour|stock\\s+\\()',
    re.IGNORECASE
)

def parse_qty(text):
    t = text.strip()
    if NIL_RE.match(t):
        return 0.0
    if BOX_NUM_RE.match(t):
        try:
            return float(re.sub(r'[^\\d.]', '', t))
        except Exception:
            return 0.0
    if re.search(r'\\bBOX\\b', t, re.IGNORECASE):
        nums = re.findall(r'\\d+(?:\\.\\d+)?', t)
        if nums:
            return sum(float(n) for n in nums)
    return None

def parse_text_pdf(doc):
    results        = []
    current_size   = None
    current_finish = None

    for page_num in range(doc.page_count):
        page       = doc[page_num]
        page_tiles = []

        # Line-level extraction: get_text('dict') gives each visual line its own
        # bbox so sorting at line level (not block level) interleaves left-column
        # names with right-column quantities -- fixes SG + BizTiletech formats.
        raw_lines = []
        for blk in page.get_text('dict')['blocks']:
            if blk.get('type') != 0:
                continue
            for ln in blk['lines']:
                text = ' '.join(s['text'] for s in ln['spans']).strip()
                text = re.sub(r'\\s+', ' ', text)
                if text:
                    raw_lines.append({'text': text,
                                      'x': ln['bbox'][0],
                                      'y': ln['bbox'][1]})

        raw_lines.sort(key=lambda l: (round(l['y'] / 6) * 6, l['x']))

        cur_name = []
        cur_box  = None
        cur_pcs  = None

        def flush():
            nonlocal cur_name, cur_box, cur_pcs
            if cur_name and cur_box is not None:
                name = ' '.join(cur_name)
                if len(name) > 3:
                    page_tiles.append(make_tile(
                        name, cur_box, cur_pcs,
                        current_size=current_size, current_finish=current_finish
                    ))
            cur_name.clear()
            cur_box = cur_pcs = None

        for item in raw_lines:
            line = item['text']
            if not line or SKIP_PAT.match(line):
                continue
            if re.match(r'^[\\(\\)\\[\\]\\-=|]+$', line):
                continue
            if re.match(r'^\\(\\s*[^)]{1,25}\\s*\\)$', line) and not DIMENSION_RE.search(line):
                continue

            cat_m = CATEGORY_RE.match(line)
            if cat_m:
                flush()
                dim = re.sub(r'\\s', '', cat_m.group(1)).upper().replace('x', 'X')
                current_size = dim
                fm = FINISH_RE.search(cat_m.group(2))
                if fm:
                    current_finish = fm.group(0).upper()
                continue

            if PURE_DIM_RE.match(line):
                dim = re.sub(r'[^\\dXx]', '', line).upper().replace('x', 'X')
                if cur_name and cur_box is None:
                    current_size = dim
                else:
                    flush()
                    current_size = dim
                continue

            qty = parse_qty(line)
            if qty is not None and not DIMENSION_RE.search(line):
                if cur_name:
                    if cur_box is None:
                        cur_box = qty
                    elif cur_pcs is None:
                        cur_pcs = qty
                continue

            if DIMENSION_RE.search(line) or starts_with_brand(line):
                flush()
                cur_name = [line]
                cur_box = cur_pcs = None
                continue

            if cur_name and len(line) > 2 and not re.match(r'^\\d+$', line):
                cur_name.append(line)

        flush()

        imgs = get_tile_images(page, doc)
        for i, tile in enumerate(page_tiles):
            if i < len(imgs):
                tile['imageData'] = imgs[i]['b64']
        results.extend(page_tiles)

    return results

# ── OCR-based parser (fully scanned / image-only PDFs) ───────────────────────
def parse_ocr_pdf(doc):
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return []

    results        = []
    current_size   = None
    current_finish = None

    for page_num in range(doc.page_count):
        page = doc[page_num]

        # OCR only the left 60 % of the page — avoids noise from tile photos
        page_rect = page.rect
        clip = fitz.Rect(0, 0, page_rect.width * 0.60, page_rect.height)
        mat  = fitz.Matrix(3, 3)
        pix  = page.get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csGRAY)
        img  = Image.frombytes('L', [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(img, config='--psm 4')

        tile_imgs  = get_tile_images(page, doc)
        page_tiles = []

        for raw_line in text.splitlines():
            line = re.sub(r'\\s+', ' ', raw_line).strip()
            if not line:
                continue

            # Filter obvious OCR noise
            alpha_ratio = sum(1 for c in line if c.isalpha()) / max(len(line), 1)
            if alpha_ratio < 0.35 and len(line) < 25:
                continue
            if re.match(r'^[^A-Za-z0-9]{0,3}$', line):
                continue

            # ── category header ───────────────────────────────────────────────
            cat_m = CATEGORY_RE.match(line)
            if cat_m:
                dim = re.sub(r'\\s', '', cat_m.group(1)).upper().replace('x','X')
                current_size = dim
                fm = FINISH_RE.search(cat_m.group(2))
                if fm:
                    current_finish = re.sub(r'\\s+', ' ', fm.group(0)).upper()
                continue

            # Optional location annotation in line
            location = None
            loc_m = LOCATION_RE.search(line)
            if loc_m:
                location = loc_m.group(0).strip()

            # ── tile with box count ───────────────────────────────────────────
            m = TILE_BOX_RE.match(line)
            if m:
                name  = re.sub(r'\\s+', ' ', m.group(1)).strip()
                count = float(m.group(2))
                if len(name) >= 3 and starts_with_brand(name):
                    page_tiles.append(make_tile(
                        name, count,
                        current_size=current_size, current_finish=current_finish,
                        location=location,
                    ))
                continue

            # ── out of stock ──────────────────────────────────────────────────
            m = TILE_OOS_RE.match(line)
            if m:
                name = re.sub(r'\\s+', ' ', m.group(1)).strip()
                if len(name) >= 3 and starts_with_brand(name):
                    page_tiles.append(make_tile(
                        name, 0.0,
                        current_size=current_size, current_finish=current_finish,
                        location=location,
                    ))
                continue

            # ── brand line with no count (display / uncounted category tiles) ─
            if starts_with_brand(line) and alpha_ratio >= 0.50 and len(line) >= 5:
                page_tiles.append(make_tile(
                    line, None,
                    current_size=current_size, current_finish=current_finish,
                    location=location,
                ))

        # Match tile photos to tiles by index (both sorted top-to-bottom)
        for i, tile in enumerate(page_tiles):
            if i < len(tile_imgs):
                tile['imageData'] = tile_imgs[i]['b64']

        results.extend(page_tiles)

    return results

# ── entry point ──────────────────────────────────────────────────────────────
def parse_pdf(path):
    doc   = fitz.open(path)
    items = parse_text_pdf(doc) if has_text(doc) else parse_ocr_pdf(doc)
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
  location: string | null;
}>> {
  const tmpId     = randomBytes(8).toString("hex");
  const pdfPath   = join(tmpdir(), `upload_${tmpId}.pdf`);
  const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);
  const outPath   = join(tmpdir(), `result_${tmpId}.json`);

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
