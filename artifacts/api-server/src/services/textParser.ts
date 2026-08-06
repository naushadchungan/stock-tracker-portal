import type { ParsedItem } from "../types/pdf";

export function parseTextPdf(
  rawText: string,
  images: { b64: string; y: number; page: number }[]
): ParsedItem[] {

  let layout: "A" | "B" | "C" | "UNKNOWN" = "UNKNOWN";

// Layout B - Columnar table
if (
  rawText.includes("STOCK(BOX)") &&
  rawText.includes("BALANCE(BOX)")
) {
  layout = "B";
}

// Layout C - Three-column visual layout
else if (
  rawText.includes("ITEM") &&
  rawText.includes("BOX") &&
  rawText.includes("DESIGN")
) {
  layout = "C";
}

// Layout A - Stanza format
else if (
  /\b\d{3,4}\s*[Xx]\s*\d{3,4}\b/.test(rawText)
) {
  layout = "A";
}

console.log(`Local parser detected Layout ${layout}`);

return [];
}