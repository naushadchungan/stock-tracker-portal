import type { ParsedItem } from "../../types/pdf";

export function extractShreem(
  rawText: string
): ParsedItem[] {

  const items: ParsedItem[] = [];

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i];

    // Every stock item starts with 4X2 SHREEM
    if (!line.startsWith("4X2 SHREEM")) {
      continue;
    }

    let fullLine = line;

    // If the current line doesn't end with "number number",
    // append the next line.
    if (!/\d+\s+\d+$/.test(fullLine) && i + 1 < lines.length) {
      fullLine += " " + lines[i + 1];
      i++;
    }

    const match = fullLine.match(
      /^(\S+)\s+SHREEM\s+(.+?)\s+(\d+)\s+(\d+)$/
    );

    if (!match) {
      continue;
    }

    const [
      ,
      size,
      tileName,
      boxCount,
      booked
    ] = match;

    items.push({
      brand: "SHREEM",
      size,
      tileName,
      boxCount: Number(boxCount),
      pcsCount: null,
      imageData: null,
      location: null
    } as ParsedItem);
  }

  return items;
}