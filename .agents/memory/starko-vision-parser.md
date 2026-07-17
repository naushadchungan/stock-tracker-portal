---
name: Starko/Kresto PDF Vision Parsing
description: Why the Starko supplier PDF requires Claude Vision and how the fallback works
---

# Starko/Kresto PDF — Fully Image-Based PDF

## The Rule
Starko (Kresto brand) stock list PDFs have NO text layer at all. Every character — tile names, quantities, headers — is rasterized/vector paths; `page.get_text()` returns 0 words across all 65 pages.

**Why:** The PDF is generated as a designer catalog (graphics software), not from a text-based tool. This may happen with any supplier who sends a visually-designed catalog.

## How to Apply
When `has_text = False` after Python extraction:
1. Python script renders all pages as 1x-zoom PNGs and includes `page_images` in the JSON output.
2. Node.js `parsePdf()` detects empty `rawText` + `page_images` present → calls `parseViaVision()`.
3. `parseViaVision()` sends all page images to Claude Vision (claude-sonnet-4-6, max_tokens 20000).
4. Claude reads the table (Item Name | Qty | Picture), returns JSON with `pageIndex` field.
5. Tile photos from Python image extraction are matched to items by `pageIndex` (pop from front of each page's queue).

## Starko Layout Details
- 3-column table: Item Name | Qty | Picture
- Qty: "NNN BOX" → boxCount=NNN, "OUT OF STOCK" → boxCount=0 (shown in red)
- Section headers (coloured rows) → size e.g. "1200X1800", finish e.g. "GLOSSY" — not items
- Brand in item name: KRESTO, LAVIT, ONE TOUCH, etc.
- Cover page (page 0): catalog cover — skip
- ~65 pages, ~9MB PNG data, ~450-580 items

## Key Numbers
- 65 pages, 1x zoom PNG, ~136KB avg per page, ~9MB total
- Within Claude's 100-image per message limit
- Set max_tokens=20000 for vision call (text path stays at 8192)
- Python script timeout bumped to 120s (was 60s) to allow page rendering time
