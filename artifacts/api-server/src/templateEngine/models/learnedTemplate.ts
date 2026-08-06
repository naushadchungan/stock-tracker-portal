export type TileField =
  | "itemName"
  | "size"
  | "finish"
  | "stock"
  | "brand"
  | "dispatchDate"
  | "photo";


export type StockUnit =
  | "box"
  | "pcs"
  | "both"
  | "unknown";


export interface FieldRule {
  field: TileField;

  /**
   * How the local extractor should locate this field.
   */
  source:
    | "column"
    | "line"
    | "header"
    | "nearby_text"
    | "image";

  /**
   * Column/header/label name if available.
   */
  label?: string;

  /**
   * Zero-based column position if applicable.
   */
  columnIndex?: number;

  /**
   * Optional regex learned from the document structure.
   */
  pattern?: string;

  required: boolean;
}


export interface RowRule {
  /**
   * How ADIE knows that a line/row represents a tile item.
   */
  startPattern?: string;

  /**
   * Minimum number of fields expected in a valid item.
   */
  minimumFields: number;

  /**
   * Whether one logical product row can continue
   * onto the following physical text lines.
   */
  multiline: boolean;
}


/**
 * Describes how stock quantities are represented
 * in this particular PDF layout.
 */
export interface StockDefinition {
  /**
   * What type of stock quantity the document provides.
   */
  unit: StockUnit;

  /**
   * Zero-based column containing box quantity.
   */
  boxColumnIndex?: number;

  /**
   * Zero-based column containing loose-piece quantity.
   */
  pcsColumnIndex?: number;

  /**
   * Fixed number of pieces per box, if applicable.
   */
  piecesPerBox?: number;

  /**
   * True when pieces-per-box changes depending
   * on product, section, size, etc.
   */
  piecesPerBoxVariable?: boolean;
}


export interface LearnedTemplateDefinition {
  schemaVersion: 1;

  documentType: "tile_stock_report";

  /**
   * Rules for extracting the required tile information.
   */
  fields: FieldRule[];

  /**
   * Rules describing how product rows are structured.
   */
  rowRule: RowRule;

  /**
   * Describes BOX / PCS stock semantics.
   */
  stockDefinition: StockDefinition;

  /**
   * Fixed structural labels useful for validating the layout.
   *
   * These should describe document structure,
   * not supplier or brand identity.
   */
  structuralAnchors: string[];

  /**
   * Notes generated during learning for debugging
   * and future admin review.
   */
  learningNotes?: string[];
}