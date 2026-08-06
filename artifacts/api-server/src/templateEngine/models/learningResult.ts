import type { LearnedTemplateDefinition } from "./learnedTemplate.js";

export interface LearnedTileItem {
  /**
   * Product / tile design name.
   */
  itemName: string | null;

  /**
   * Tile size, for example:
   * 4X2
   * 2X2
   * 1600X800
   * 800X2400
   */
  size: string | null;

  /**
   * Surface finish when available.
   *
   * Examples:
   * GLOSSY
   * MATT
   * HIGH GLOSSY
   * CARVING MATT
   */
  finish: string | null;

  /**
   * Legacy stock field.
   *
   * Kept temporarily for backward compatibility
   * with existing ADIE code.
   *
   * For documents containing BOX + PCS,
   * this should normally contain boxCount.
   *
   * New code should prefer boxCount / pcsCount.
   */
  stock: number | null;

  /**
   * Number of full boxes available.
   */
  boxCount: number | null;

  /**
   * Number of loose pieces available.
   */
  pcsCount: number | null;

  /**
   * Number of pieces contained in one full box
   * when this can be determined from the section.
   *
   * Example:
   *
   * SHREEM (2 PCS)
   *
   * means piecesPerBox = 2.
   */
  piecesPerBox: number | null;

  /**
   * Brand / manufacturer when reliably known.
   */
  brand: string | null;

  /**
   * Dispatch date associated with the item,
   * when explicitly present in the document.
   */
  dispatchDate: string | null;

  /**
   * Reference to an extracted product image.
   *
   * Actual image-to-product association and
   * image storage remain outside the learned
   * template extractor.
   */
  photoRef: string | null;
}

export interface LearningResult {
  documentType: "tile_stock_report";

  /**
   * Overall learning confidence from 0 to 100.
   */
  confidence: number;

  /**
   * Items extracted during the learning pass.
   */
  items: LearnedTileItem[];

  /**
   * Reusable structural rules learned from
   * the document.
   */
  template: LearnedTemplateDefinition;

  /**
   * Non-fatal problems or ambiguities discovered
   * during learning.
   */
  warnings: string[];
}