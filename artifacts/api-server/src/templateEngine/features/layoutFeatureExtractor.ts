import type { DocumentModel } from "../models/documentModel.js";

export interface LayoutFeatures {
  columnCount: number;
  sectionCount: number;
  headingPattern: string[];
  averageLineLength: number;
  averageWordsPerLine: number;
  stockRowPattern: string[];
  sizePattern: string[];
  dispatchDatePattern: string[];
  finishPattern: string[];
  brandPattern: string[];
}

/**
 * Extracts reusable layout-level features from a document model.
 *
 * The extractor is intentionally document-only and isolated from any
 * matching or persistence logic so it can be reused by future engines.
 */
export class LayoutFeatureExtractor {
  extract(document: DocumentModel): LayoutFeatures {
    const lines = this.getNormalizedLines(document);

    return {
      columnCount: this.extractColumnCount(document),
      sectionCount: this.extractSectionCount(document),
      headingPattern: this.extractHeadingPattern(document),
      averageLineLength: this.calculateAverageLineLength(lines),
      averageWordsPerLine: this.calculateAverageWordsPerLine(lines),
      stockRowPattern: this.extractStockRowPattern(lines),
      sizePattern: this.extractSizePattern(lines),
      dispatchDatePattern: this.extractDispatchDatePattern(lines),
      finishPattern: this.extractFinishPattern(lines),
      brandPattern: this.extractBrandPattern(lines),
    };
  }

  private getNormalizedLines(document: DocumentModel): string[] {
    return (document.blocks ?? [])
      .map((block) => block.text?.trim() ?? "")
      .filter(Boolean);
  }

  private extractColumnCount(document: DocumentModel): number {
    const layout = document.layout;
    const headers = layout?.headers ?? [];

    if (headers.length > 0) {
      return headers.length;
    }

    return document.tables?.length ? document.tables.length : 0;
  }

  private extractSectionCount(document: DocumentModel): number {
    return document.layout?.sections?.length ?? 0;
  }

  private extractHeadingPattern(document: DocumentModel): string[] {
    const headers = document.layout?.headers ?? [];

    return headers
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
  }

  private calculateAverageLineLength(lines: string[]): number {
    if (lines.length === 0) {
      return 0;
    }

    const total = lines.reduce((sum, line) => sum + line.length, 0);
    return Math.round(total / lines.length);
  }

  private calculateAverageWordsPerLine(lines: string[]): number {
    if (lines.length === 0) {
      return 0;
    }

    const totalWords = lines.reduce(
      (sum, line) => sum + line.split(/\s+/).filter(Boolean).length,
      0
    );

    return Math.round(totalWords / lines.length);
  }

  private extractStockRowPattern(lines: string[]): string[] {
    const patterns: string[] = [];

    for (const line of lines) {
      if (/\b\d{1,4}\b/.test(line) && /\b\d{1,4}\b/.test(line)) {
        patterns.push(line);
      }
    }

    return patterns.slice(0, 10);
  }

  private extractSizePattern(lines: string[]): string[] {
    const patterns: string[] = [];

    for (const line of lines) {
      const matches = line.match(/\b\d{1,4}\s*[Xx×]\s*\d{1,4}\b/g) ?? [];
      patterns.push(...matches);
    }

    return patterns.slice(0, 10);
  }

  private extractDispatchDatePattern(lines: string[]): string[] {
    const patterns: string[] = [];

    for (const line of lines) {
      const matches = line.match(/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/g) ?? [];
      patterns.push(...matches);
    }

    return patterns.slice(0, 10);
  }

  private extractFinishPattern(lines: string[]): string[] {
    const finishes = [
      "GLOSSY",
      "MATT",
      "MATTE",
      "HIGH GLOSSY",
      "SUPER GLOSSY",
      "SATIN",
      "RUSTIC",
      "CARVING",
      "POLISHED",
      "SUGAR",
    ];

    const matches: string[] = [];

    for (const line of lines) {
      const upper = line.toUpperCase();

      for (const finish of finishes) {
        if (upper.includes(finish)) {
          matches.push(finish);
          break;
        }
      }
    }

    return matches.slice(0, 10);
  }

  private extractBrandPattern(lines: string[]): string[] {
    const patterns: string[] = [];

    for (const line of lines) {
      if (!/[A-Za-z]/.test(line)) {
        continue;
      }

      const trimmed = line.trim();
      if (/\b\d{1,4}\s*[Xx×]\s*\d{1,4}\b/.test(trimmed)) {
        continue;
      }

      if (/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(trimmed)) {
        continue;
      }

      patterns.push(trimmed);
    }

    return patterns.slice(0, 10);
  }
}

export default new LayoutFeatureExtractor();
