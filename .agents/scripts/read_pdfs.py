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
    print(f"\n{'='*60}")
    print(f"FILE: {os.path.basename(pdf_path)}")
    print('='*60)
    doc = fitz.open(pdf_path)
    print(f"Pages: {doc.page_count}")
    for i, page in enumerate(doc):
        print(f"\n--- Page {i+1} ---")
        text = page.get_text()
        print(text[:3000])
        if len(text) > 3000:
            print(f"... [TRUNCATED, total {len(text)} chars]")
    doc.close()
