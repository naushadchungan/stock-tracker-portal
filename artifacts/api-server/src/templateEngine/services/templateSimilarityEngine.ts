import type { DocumentModel } from "../models/documentModel.js";

export interface SimilarityResult {
  score: number;
  breakdown: {
    fingerprint: number;
    sectionHeadings: number;
    columnCount: number;
    averageLineLength: number;
    stockRowPattern: number;
    sizePattern: number;
  };
  matched: boolean;
}

/**
 * Compares two document layouts using a small set of structural signals.
 *
 * The engine is intentionally reusable and isolated from the existing
 * template matching flow so it can be integrated later without changing
 * current behavior.
 */
export class TemplateSimilarityEngine {
  compare(
    a: DocumentModel,
    b: DocumentModel
  ): SimilarityResult {
    const fingerprint = this.compareFingerprint(a, b);
    const sectionHeadings = this.compareSectionHeadings(a, b);
    const columnCount = this.compareColumnCount(a, b);
    const averageLineLength = this.compareAverageLineLength(a, b);
    const stockRowPattern = this.compareStockRowPattern(a, b);
    const sizePattern = this.compareSizePattern(a, b);

    const weightedScore =
      fingerprint * 0.3 +
      sectionHeadings * 0.2 +
      columnCount * 0.15 +
      averageLineLength * 0.1 +
      stockRowPattern * 0.15 +
      sizePattern * 0.1;

    const score = Math.max(0, Math.min(100, Math.round(weightedScore)));

    return {
      score,
      breakdown: {
        fingerprint,
        sectionHeadings,
        columnCount,
        averageLineLength,
        stockRowPattern,
        sizePattern,
      },
      matched: score >= 80,
    };
  }

  /**
   * Compares the document fingerprint values when present.
   */
  private compareFingerprint(
    a: DocumentModel,
    b: DocumentModel
  ): number {
    if (!a.fingerprint || !b.fingerprint) {
      return 0;
    }

    const same = a.fingerprint === b.fingerprint;
    return same ? 100 : 0;
  }

  /**
   * Compares the normalized list of section headings.
   */
  private compareSectionHeadings(
    a: DocumentModel,
    b: DocumentModel
  ): number {
    const left = this.normalizeTokens(a.layout?.sectionHeadings ?? []);
    const right = this.normalizeTokens(b.layout?.sectionHeadings ?? []);

    if (left.length === 0 && right.length === 0) {
      return 0;
    }

    const intersection = this.countIntersection(left, right);
    const union = new Set([...left, ...right]).size;

    if (union === 0) {
      return 0;
    }

    return Math.round((intersection / union) * 100);
  }

  /**
   * Compares the number of columns in the layout.
   */
  private compareColumnCount(
    a: DocumentModel,
    b: DocumentModel
  ): number {
    const left = a.layout?.columnCount ?? 0;
    const right = b.layout?.columnCount ?? 0;

    if (left === 0 || right === 0) {
      return 0;
    }

    return left === right ? 100 : 0;
  }

  /**
   * Compares the average line length across the document blocks.
   */
  private compareAverageLineLength(
    a: DocumentModel,
    b: DocumentModel
  ): number {
    const left = this.getAverageLineLength(a);
    const right = this.getAverageLineLength(b);

    if (left === 0 || right === 0) {
      return 0;
    }

    const diff = Math.abs(left - right);
    const ratio = Math.max(0, 100 - diff * 2);
    return Math.round(Math.min(100, ratio));
  }

  /**
   * Compares recurring stock row patterns, such as stock values or numeric clusters.
   */
  private compareStockRowPattern(
    a: DocumentModel,
    b: DocumentModel
  ): number {
    const left = this.extractStockRowPattern(a);
    const right = this.extractStockRowPattern(b);

    if (!left || !right) {
      return 0;
    }

    return left === right ? 100 : 0;
  }

  /**
   * Compares size-pattern frequency by looking at common size-like tokens.
   */
  private compareSizePattern(
    a: DocumentModel,
    b: DocumentModel
  ): number {
    const left = this.extractSizePattern(a);
    const right = this.extractSizePattern(b);

    if (!left || !right) {
      return 0;
    }

    return left === right ? 100 : 0;
  }

  private normalizeTokens(values: string[]): string[] {
    return values
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }

  private countIntersection(left: string[], right: string[]): number {
    const rightSet = new Set(right);
    return left.filter((value) => rightSet.has(value)).length;
  }

  private getAverageLineLength(document: DocumentModel): number {
    const blocks = document.blocks ?? [];

    if (blocks.length === 0) {
      return 0;
    }

    const lengths = blocks
      .map((block) => block.text?.trim().length ?? 0)
      .filter((length) => length > 0);

    if (lengths.length === 0) {
      return 0;
    }

    const total = lengths.reduce((sum, length) => sum + length, 0);
    return Math.round(total / lengths.length);
  }

  private extractStockRowPattern(document: DocumentModel): string | null {
    const blocks = document.blocks ?? [];

    const matched = blocks
      .map((block) => block.text?.trim() ?? "")
      .filter(Boolean)
      .find((text) => /\b\d{1,4}\b/.test(text) && /\b\d{1,4}\b/.test(text));

    if (!matched) {
      return null;
    }

    return matched.replace(/\s+/g, " ").trim();
  }

  private extractSizePattern(document: DocumentModel): string | null {
    const blocks = document.blocks ?? [];

    const sizes = blocks
      .map((block) => block.text?.trim() ?? "")
      .filter(Boolean)
      .flatMap((text) => text.match(/\b\d{1,4}\s*[Xx×]\s*\d{1,4}\b/g) ?? []);

    if (sizes.length === 0) {
      return null;
    }

    return sizes.slice(0, 5).join("|");
  }
}

export default new TemplateSimilarityEngine();
