export interface ConfidenceResult {
  score: number;
  decision: "LOCAL" | "VALIDATE" | "CLAUDE";
  reasons: string[];
}

export interface TemplateConfidenceInput {
  exactMatchFound: boolean;
  similarityScore: number;
  templateAge: number;
  templateUsageCount: number;
  extractorConfidence?: number;
}

/**
 * Computes a lightweight confidence score for template selection.
 *
 * The engine is intentionally reusable and isolated from the matching flow,
 * so it can be integrated later without changing runtime behavior elsewhere.
 */
export class TemplateConfidenceEngine {
  calculate(input: TemplateConfidenceInput): ConfidenceResult {
    let score = 0;
    const reasons: string[] = [];

    // An exact match starts the confidence at the highest level because it is
    // the strongest signal that the stored template is an exact fit.
    if (input.exactMatchFound) {
      score += 100;
      reasons.push("exact match found");
    }

    // High similarity should increase confidence because the layout structure
    // closely aligns with the stored template.
    if (input.similarityScore > 0) {
      const similarityBoost = input.similarityScore * 0.6;
      score += similarityBoost;
      reasons.push(`similarity ${input.similarityScore}%`);
    }

    // Frequently used templates are more reliable, so they receive a small
    // confidence increase based on usage history.
    if (input.templateUsageCount > 0) {
      const usageBoost = Math.min(15, input.templateUsageCount * 0.5);
      score += usageBoost;
      reasons.push(`usage count ${input.templateUsageCount}`);
    }

    // Older stable templates slightly increase confidence because they have
    // had more time to prove their consistency.
    if (input.templateAge > 0) {
      const ageBoost = Math.min(10, input.templateAge * 0.2);
      score += ageBoost;
      reasons.push(`template age ${input.templateAge}`);
    }

    // Optional extractor confidence can nudge the score upward when the
    // extraction pipeline is already confident in its own result.
    if (typeof input.extractorConfidence === "number") {
      const extractorBoost = Math.max(0, Math.min(20, input.extractorConfidence * 20));
      score += extractorBoost;
      reasons.push(`extractor confidence ${input.extractorConfidence}`);
    }

    // Low similarity should reduce confidence because a weak structural match
    // suggests the template may not be appropriate.
    if (!input.exactMatchFound && input.similarityScore < 70) {
      score -= 25;
      reasons.push("low similarity penalty");
    }

    const boundedScore = Math.max(0, Math.min(100, Math.round(score)));

    const decision = this.decide(boundedScore);

    return {
      score: boundedScore,
      decision,
      reasons,
    };
  }

  private decide(score: number): ConfidenceResult["decision"] {
    if (score >= 85) {
      return "LOCAL";
    }

    if (score >= 60) {
      return "VALIDATE";
    }

    return "CLAUDE";
  }
}

export default new TemplateConfidenceEngine();
