import Anthropic from "@anthropic-ai/sdk";
import type { ParsedItem } from "../types/pdf";
import { extractJsonArray } from "../utils/jsonExtractor";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
export async function parseViaClaude(
  rawText: string,
  images: { b64: string; y: number; page: number }[]
): Promise<ParsedItem[]> {
  // ── Text-based PDF → use Claude text extraction (existing path) ───────────
  let fullText = "";
  const stream = await anthropic.messages.stream({
    model:      "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{
      role: "user",
      content: `You are a tile stock data extractor for an Indian tiles business.
Extract EVERY tile/product item from the PDF text below.

The PDF may use one of three layouts — detect which one applies and parse accordingly:

LAYOUT A — Stanza format (dimension-prefixed names, e.g. "800X2400 SHREEM ELEGANT WHITE"):
  • Each item line starts with a dimension (e.g. "600X1200") or brand name.
  • Section headers like "SHREEM (1PCS) (FULLBODY)" are NOT items — skip them.
  • The numbers after each item are: box count, then pieces count.
  • boxCount = boxes in stock.

LAYOUT B — Columnar table format (headers: NO / DESIGN / ITEM NAME / SIZE / STOCK(BOX) / BOOKING / BALANCE(BOX) / NO PCS/BOX):
  • Each row has a sequential row number, optional design tag like "(NEW)", item name, size, stock, booking, balance, pcs.
  • boxCount = BALANCE(BOX) column (NOT the STOCK(BOX) column).
  • pcsCount = NO PCS/BOX column.
  • Design tags like "(NEW)", "(MIXED BATCH)" are NOT part of the tile name — strip them.

LAYOUT C — Three-column visual layout (columns: ITEM | BOX | DESIGN):
  • The page header has columns labeled ITEM, BOX, DESIGN (and sometimes RATE).
  • The text is extracted row-by-row based on Y position. Large horizontal gaps in a line indicate column boundaries.
  • Section/category headers like "1200X600 GLOSSY", "1200X600 MATT", "300x600", "800X1200", "1800X1200 GLOSSY PATHIRIPALA", "1200X600 LAMINATED WOOD", "1200X600 CARVING MATT", "600X600" etc. are dividers — NOT items. Skip them.
  • Sub-depot markers like "MALAPPURAM-CHEMMANIYODE DEPO." indicate a location change for items that follow. Record that location for those items.
  • Each tile item occupies a BLOCK of 2–4 consecutive lines:
      Line 1: size + brand name  (e.g. "600X1200 LORENZO")
      Line 2: rest of name       (e.g. "MANGUS WHITE -")
      Line 3: finish             (e.g. "GLOSSY")
    Join all lines of the block to form the full tileName.
  • The BOX value (a number like 982.1 or 141, or text like "DISPATCHED ON 07-07") appears on THE SAME LINE as one of the item's lines, separated by large spaces.
    It can appear on line 1, line 2, or line 3 of the item block — whichever line is vertically centred beside the block.
    Example extracted text:
      "600X1200 LORENZO"
      "MANGUS WHITE -         982.1"   ← boxCount is 982.1 here
      "GLOSSY"
    Another example:
      "1200X600 ROCO"                  ← here the number is on line 1
      "141"
      "ETRO SMOKE IVORY-"
      "GLOSSY"
    In both cases 982.1 / 141 is the boxCount for that item.
  • A bare number on a line by itself (no item text) belongs to the item block immediately above or below it.
  • "DISPATCHED ON ..." anywhere in the item block means boxCount = 0.
  • Rate/price values (e.g. "400", "500", "70/PC", "50/PCS", "34.10 RS/SQ.FT") are in the RATE column (far right) — ignore them for boxCount.
    Tell apart: a rate value is followed by "/PC", "/PCS", "RS/SQ.FT", or appears alongside an "RS" label; a boxCount is just a plain integer or decimal (e.g. 48, 122.1).
  • Pieces-per-box hints like "(5PCS)", "(6PCS)", "(7PCS)" embedded in the tile name → pcsCount = that number.
  • Adhesive/grout/epoxy products (EPOXY, TILE ADHESIVE, GEL, GLASS BOND, etc.) ARE valid items. Their box count is 0 if no number is shown.
  • Square-footage notes like "(20.67 SQFT PER BOX)" are not box counts — skip.

Common rules for all layouts:
  • Return ONLY a raw JSON array — NO markdown fences, NO explanation, NO pretty-printing.
  • Output each JSON object on a SINGLE LINE with no internal newlines or extra spaces.
    Example of correct compact format:
    [{"tileName":"600X1200 LORENZO MANGUS WHITE GLOSSY","brand":"LORENZO","size":"600X1200","finish":"GLOSSY","boxCount":982.1,"pcsCount":null,"location":null},{"tileName":"...","brand":"...","size":"...","finish":"...","boxCount":0,"pcsCount":null,"location":null}]
  • Each element must have exactly these fields (no others, in this order):
      "tileName" : full assembled tile name (size + brand + model + finish joined with spaces, cleaned up)
      "brand"    : brand name only (e.g. "KAG", "SHREEM", "MOZILLA", "LORENZO", "AVALTA") or null
      "size"     : dimension string (e.g. "800X2400", "1200X1800", "600X600") or null
      "finish"   : finish type (GLOSSY, MATT, FULLBODY, NANO, RUSTIC, CARVING, LAPATO, LAMINATED, etc.) or null
      "boxCount" : number — boxes in stock (0 if none or dispatched, never null)
      "pcsCount" : integer pieces per box or null
      "location" : sub-depot/location name if a location marker appeared above this item, otherwise null
  • Include ALL items, even those with 0 or negative box counts.
  • Skip pure column headers, section/size category headers, footer lines, email addresses, date lines, page numbers.
  • Adhesive/gum products ARE valid items — include them with boxCount 0 if no quantity shown.
  • boxCount and pcsCount must be numbers (not strings).

PDF text:
${rawText}`,
    }],
  });

  // Collect streamed chunks into a single string
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
    }
  }

  const parsed = extractJsonArray(fullText);
  if (!parsed) return [];

  let typedParsed: Record<string, unknown>[];
  try {
    typedParsed = parsed as Record<string, unknown>[];
  } catch {
    return [];
  }

  return typedParsed
    .map((item, i) => ({
      tileName:  String(item.tileName  ?? "").trim(),
      brand:     item.brand   ? String(item.brand).trim()   : null,
      size:      item.size    ? String(item.size).trim()    : null,
      finish:    item.finish  ? String(item.finish).trim()  : null,
      boxCount:  item.boxCount  != null ? Number(item.boxCount)  : null,
      pcsCount:  item.pcsCount  != null ? Number(item.pcsCount)  : null,
      imageData: images[i]?.b64 ?? null,
      location:  item.location ? String(item.location).trim() : null,
    }))
    .filter(item => item.tileName.length > 0);
  }
