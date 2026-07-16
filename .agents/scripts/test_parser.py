import fitz
import json
import sys
import re

DIMENSION_RE = re.compile(r'\b\d+\s*[Xx]\s*\d+\b')
BOX_NUM_RE = re.compile(r'^[\d]+\.?\d*\s*(BOX)?$', re.IGNORECASE)
NIL_RE = re.compile(r'^nil$', re.IGNORECASE)
FINISH_RE = re.compile(r'\b(GLOSSY|MATT|POSH|ENDLESS|HI GLOSSY|ENDLESS GLOSSY)\b', re.IGNORECASE)

SKIP_LINES = re.compile(
    r'^(item\s+name|name|box|pcs|design|stock\s+list|epoxy|adhesive|topkrete|cp water|millennium|dispatched|despatch|plain\s+colour)',
    re.IGNORECASE
)

BRANDS = ['SHREEM','MOZILLA','MILLO','ROCO','AVALTA','TOSSA','BLUEGRESS','GEOGRESS',
          'MONOLITH','ROCK','SOLO','NERISS','LORENZO','ALIVE','NEVADA','CRESTO',
          'FORTUNE','NEXUS','OPULUX']

def extract_brand(name):
    for b in BRANDS:
        if b in name.upper():
            return b
    return None

def extract_size(name):
    m = DIMENSION_RE.search(name)
    if m:
        return m.group(0).replace(' ','').upper()
    return None

def extract_finish(name):
    m = FINISH_RE.search(name)
    if m:
        return m.group(0).upper()
    return None

def parse_pdf(path):
    doc = fitz.open(path)
    results = []
    
    for page_num in range(doc.page_count):
        page = doc[page_num]
        # Get blocks sorted by Y then X
        blocks = sorted(page.get_text("blocks"), key=lambda b: (round(b[1]/40)*40, b[0]))
        
        current_name_parts = []
        current_box = None
        current_pcs = None
        
        for b in blocks:
            text = b[4].strip()
            if not text:
                continue
            
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            
            for line in lines:
                # Skip headers and non-stock lines
                if SKIP_LINES.match(line):
                    continue
                if line in ('(', ')', '1200X600 GLOSSY', '1200X600 MATT', '600X1200 GLOSSY',
                           '800X2400', '1600X800', '600X600', '1800X1200', '800X800'):
                    continue
                # Skip lines that are just parentheses/brackets
                if re.match(r'^[\(\)\[\]]+$', line):
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
                    num_val = float(re.sub(r'[^\d.]', '', line)) if line.lower() != 'nil' else 0.0
                    if current_name_parts:
                        if current_box is None:
                            current_box = num_val
                        elif current_pcs is None:
                            current_pcs = num_val
                elif DIMENSION_RE.search(line):
                    # Save previous item
                    if current_name_parts and current_box is not None:
                        name = ' '.join(current_name_parts)
                        name = re.sub(r'\s+', ' ', name).strip()
                        if len(name) > 5:
                            results.append({
                                'tileName': name,
                                'brand': extract_brand(name),
                                'size': extract_size(name),
                                'finish': extract_finish(name),
                                'boxCount': current_box,
                                'pcsCount': current_pcs,
                            })
                    current_name_parts = [line]
                    current_box = None
                    current_pcs = None
                else:
                    # continuation of tile name or other text
                    if current_name_parts:
                        # Only append if it looks like part of a name, not a stray word
                        if len(line) > 2 and not re.match(r'^\d+$', line):
                            current_name_parts.append(line)
        
        # Save last item on page
        if current_name_parts and current_box is not None:
            name = ' '.join(current_name_parts)
            name = re.sub(r'\s+', ' ', name).strip()
            if len(name) > 5:
                results.append({
                    'tileName': name,
                    'brand': extract_brand(name),
                    'size': extract_size(name),
                    'finish': extract_finish(name),
                    'boxCount': current_box,
                    'pcsCount': current_pcs,
                })
        
    doc.close()
    return results

if __name__ == '__main__':
    pdf_files = [
        "attached_assets/10-07-2026-2_1784197853030.pdf",
        "attached_assets/11-07_STOCK_SUMMARY_CHEMMANIYODE-1_1784197853030.pdf",
        "attached_assets/STOCK_SUMMARY_KOTTAKKAL-11-07-2026_--1_1784197853030.pdf",
    ]
    for f in pdf_files:
        print(f"\n=== {f} ===")
        items = parse_pdf(f)
        print(f"  Extracted {len(items)} items")
        for item in items[:5]:
            print(f"  {item}")
