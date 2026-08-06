import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
export interface ExtractedPdfData {
  rawText: string;
  images: { b64: string; y: number; page: number }[];
  pageImages: { b64: string; page: number; mime: string }[];
}

const execAsync = promisify(exec);
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
export async function extractPdf(
  pdfBuffer: Buffer
): Promise<ExtractedPdfData> {
  const tmpId = randomBytes(8).toString("hex");

const pdfPath = join(tmpdir(), `upload_${tmpId}.pdf`);
const scriptPath = join(tmpdir(), `parse_${tmpId}.py`);
const outPath = join(tmpdir(), `result_${tmpId}.json`);

let rawText = "";
let images: { b64: string; y: number; page: number }[] = [];
let pageImages: { b64: string; page: number; mime: string }[] = [];
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
  return {
  rawText,
  images,
  pageImages,
};
}