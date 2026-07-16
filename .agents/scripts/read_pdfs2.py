import fitz
import os

pdf_files = [
    "attached_assets/10-07-2026-2_1784197853030.pdf",
    "attached_assets/11-07_STOCK_SUMMARY_CHEMMANIYODE-1_1784197853030.pdf",
    "attached_assets/STOCK_SUMMARY_KOTTAKKAL-11-07-2026_--1_1784197853030.pdf",
    "attached_assets/TRUSTO_GALLERIA_11-07_XL_(1)_1784197853030.pdf",
    "attached_assets/11-07_STOCK_SUMMARY_PATHIRIPALA-1_1784197853030.pdf",
]

for pdf_path in pdf_files:
    print(f"\n{'='*70}")
    print(f"FILE: {os.path.basename(pdf_path)}")
    print('='*70)
    doc = fitz.open(pdf_path)
    print(f"Pages: {doc.page_count}")
    # Print only first 2 pages to see structure
    for i in range(min(3, doc.page_count)):
        page = doc[i]
        print(f"\n--- Page {i+1} (full text) ---")
        # Get structured text with blocks
        blocks = page.get_text("blocks")
        for b in blocks:
            # b = (x0, y0, x1, y1, text, block_no, block_type)
            print(f"  [{b[5]}] y={b[1]:.0f}: {repr(b[4][:200])}")
    doc.close()
