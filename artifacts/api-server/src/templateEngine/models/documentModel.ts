export interface TextBlock {
  text: string;
  page: number;

  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface TableColumn {
  name: string;
  index: number;
}

export interface TableRow {
  values: string[];
}

export interface TableModel {
  columns: TableColumn[];
  rows: TableRow[];
}

export interface LayoutModel {
  headers: string[];
  sections: string[];
}

export interface MetadataModel {
  supplier?: string;
  reportType?: string;
  pages: number;
}

export interface DocumentModel {
  metadata: MetadataModel;

  layout: LayoutModel;

  tables: TableModel[];

  blocks: TextBlock[];
}