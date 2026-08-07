import type { LayoutFeatures } from "../features/layoutFeatureExtractor.js";

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
 * Compares two layout-feature objects using a small set of structural signals.
 *
 * The engine is intentionally reusable and isolated from the existing
 * template matching flow so it can be integrated later without changing
 * current behavior.
 */
export class TemplateSimilarityEngine {
  compare(a: LayoutFeatures, b: LayoutFeatures): SimilarityResult {
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
   * Compares a lightweight signature created from the layout features.
   * This acts as a high-level fingerprint check for similar layout families.
   */
  private compareFingerprint(a: LayoutFeatures, b: LayoutFeatures): number {
    const leftSignature = this.buildSignature(a);
    const rightSignature = this.buildSignature(b);

    if (!leftSignature || !rightSignature) {
      return 0;
    }

    return leftSignature === rightSignature ? 100 : 0;
  }

  /**
   * Compares section headings by measuring overlap between the normalized
   * heading tokens so shared labels raise the similarity score.
   */
  private compareSectionHeadings(a: LayoutFeatures, b: LayoutFeatures): number {
    const left = this.normalizeTokens(a.headingPattern);
    const right = this.normalizeTokens(b.headingPattern);

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
   * Compares the reported column count exactly, because a layout is only
   * structurally similar when both feature sets describe the same column count.
   */
  private compareColumnCount(a: LayoutFeatures, b: LayoutFeatures): number {
    const left = a.columnCount ?? 0;
    const right = b.columnCount ?? 0;

    if (left === 0 || right === 0) {
      return 0;
    }

    return left === right ? 100 : 0;
  }

  /**
   * Compares average line length using a tolerance-based score, which keeps
   * the original behavior of rewarding near-equal values while penalizing gaps.
   */
  private compareAverageLineLength(a: LayoutFeatures, b: LayoutFeatures): number {
    const left = a.averageLineLength ?? 0;
    const right = b.averageLineLength ?? 0;

    if (left === 0 || right === 0) {
      return 0;
    }

    const diff = Math.abs(left - right);
    const ratio = Math.max(0, 100 - diff * 2);
    return Math.round(Math.min(100, ratio));
  }

  /**
   * Compares stock row patterns by looking at how much of the feature list
   * overlaps between the two layouts, which preserves the prior intent of
   * matching recurring stock-like structure.
   */
  private compareStockRowPattern(a: LayoutFeatures, b: LayoutFeatures): number {
    const left = this.normalizeTokens(a.stockRowPattern);
    const right = this.normalizeTokens(b.stockRowPattern);

    if (left.length === 0 || right.length === 0) {
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
   * Compares size-pattern features with the same overlap-based approach,
   * allowing shared size tokens to increase the similarity signal.
   */
  private compareSizePattern(a: LayoutFeatures, b: LayoutFeatures): number {
    const left = this.normalizeTokens(a.sizePattern);
    const right = this.normalizeTokens(b.sizePattern);

    if (left.length === 0 || right.length === 0) {
      return 0;
    }

    const intersection = this.countIntersection(left, right);
    const union = new Set([...left, ...right]).size;

    if (union === 0) {
      return 0;
    }

    return Math.round((intersection / union) * 100);
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

  private buildSignature(features: LayoutFeatures): string {
    return [
      features.columnCount,
      features.sectionCount,
      features.averageLineLength,
      features.averageWordsPerLine,
      features.headingPattern.join("|"),
      features.stockRowPattern.join("|"),
      features.sizePattern.join("|"),
      features.dispatchDatePattern.join("|"),
      features.finishPattern.join("|"),
      features.brandPattern.join("|"),
    ].join("::");
  }
}

export default new TemplateSimilarityEngine();
