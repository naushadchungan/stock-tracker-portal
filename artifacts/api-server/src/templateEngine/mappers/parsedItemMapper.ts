import type { ParsedItem } from "../../types/pdf.js";
import type { LearnedTileItem } from "../models/learningResult.js";

export type StockUnit =
  | "box"
  | "pcs"
  | "unknown";

export function mapLearnedItemsToParsedItems(
  items: LearnedTileItem[],
  stockUnit: StockUnit
): ParsedItem[] {

  return items
    .filter(item =>
      item.itemName &&
      item.stock !== null
    )
    .map(item => {

      let boxCount: number | null = null;
      let pcsCount: number | null = null;

      if (stockUnit === "box") {
        boxCount = item.stock;
      }

      if (stockUnit === "pcs") {
        pcsCount = item.stock;
      }

      return {
        tileName: item.itemName ?? "",
        brand: item.brand ?? null,
        size: item.size ?? null,
        finish: item.finish ?? null,

        boxCount,
        pcsCount,

        imageData: null,
        location: null,
      } as ParsedItem;
    });
}