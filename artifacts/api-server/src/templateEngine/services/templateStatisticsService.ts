export interface TemplateStatistics {
  templateId: string;
  totalMatches: number;
  totalExtractions: number;
  averageConfidence: number;
  lastMatchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateStatisticsStore {
  get(templateId: string): TemplateStatistics | undefined;
  recordMatch(templateId: string, confidence: number): TemplateStatistics;
  recordExtraction(templateId: string): TemplateStatistics;
  reset(templateId: string): TemplateStatistics | undefined;
}

/**
 * Lightweight in-memory statistics tracker for template usage.
 *
 * The service exposes a small repository-like interface so a database-backed
 * implementation can replace it later without changing the caller contract.
 */
export class TemplateStatisticsService implements TemplateStatisticsStore {
  private readonly statisticsByTemplateId = new Map<string, TemplateStatistics>();

  /**
   * Return existing statistics for a template when available.
   */

  get(templateId: string): TemplateStatistics | undefined {
    return this.statisticsByTemplateId.get(templateId);
  }

  recordMatch(templateId: string, confidence: number): TemplateStatistics {
    const now = new Date();
    const existing = this.statisticsByTemplateId.get(templateId);

    if (existing) {
      const updated = {
        ...existing,
        totalMatches: existing.totalMatches + 1,
        averageConfidence: this.calculateAverageConfidence(
          existing.totalMatches,
          existing.averageConfidence,
          confidence
        ),
        lastMatchedAt: now,
        updatedAt: now,
      };

      this.statisticsByTemplateId.set(templateId, updated);
      return updated;
    }

    const created: TemplateStatistics = {
      templateId,
      totalMatches: 1,
      totalExtractions: 0,
      averageConfidence: confidence,
      lastMatchedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.statisticsByTemplateId.set(templateId, created);
    return created;
  }

  recordExtraction(templateId: string): TemplateStatistics {
    const now = new Date();
    const existing = this.statisticsByTemplateId.get(templateId);

    if (existing) {
      const updated = {
        ...existing,
        totalExtractions: existing.totalExtractions + 1,
        updatedAt: now,
      };

      this.statisticsByTemplateId.set(templateId, updated);
      return updated;
    }

    const created: TemplateStatistics = {
      templateId,
      totalMatches: 0,
      totalExtractions: 1,
      averageConfidence: 0,
      lastMatchedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.statisticsByTemplateId.set(templateId, created);
    return created;
  }

  reset(templateId: string): TemplateStatistics | undefined {
    const existing = this.statisticsByTemplateId.get(templateId);
    if (!existing) {
      return undefined;
    }

    this.statisticsByTemplateId.delete(templateId);
    return existing;
  }

  private calculateAverageConfidence(
    previousMatches: number,
    previousAverage: number,
    newConfidence: number
  ): number {
    return (previousAverage * previousMatches + newConfidence) / (previousMatches + 1);
  }
}

export default new TemplateStatisticsService();
