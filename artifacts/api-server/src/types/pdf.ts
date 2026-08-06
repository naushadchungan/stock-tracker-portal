// ── Types ─────────────────────────────────────────────────────────────────────
export type ParsedItem = {
  tileName: string;
  brand: string | null;
  size: string | null;
  finish: string | null;
  boxCount: number | null;
  pcsCount: number | null;
  imageData: string | null;
  location: string | null;
};