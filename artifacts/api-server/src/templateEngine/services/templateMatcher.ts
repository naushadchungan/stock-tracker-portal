import { DocumentModel } from "../models/documentModel.js";
import layoutFingerprintEngine from "../fingerprint/layoutFingerprintEngine.js";
import layoutFeatureExtractor from "../features/layoutFeatureExtractor.js";
import templateRepository, {
  TemplateRecord,
} from "../repository/templateRepository.js";
import templateConfidenceEngine from "./templateConfidenceEngine.js";
import templateSimilarityEngine from "./templateSimilarityEngine.js";

export interface TemplateMatchResult {
  fingerprint: string;
  found: boolean;
  template?: TemplateRecord;
  validationRequired?: boolean;
}

export class TemplateMatcher {
  /**
   * Determine whether the document layout is already known.
   *
   * Matching is based on a fingerprint computed from the document
   * structure, then looking up the most recent template for that
   * fingerprint. If the exact fingerprint is not found, a feature-based
   * similarity comparison is used as a fallback.
   */
  match(document: DocumentModel): TemplateMatchResult {
    const fingerprint = this.computeFingerprint(document);

    // Preserve the existing exact fingerprint lookup exactly as before.
    const template = this.lookupTemplate(fingerprint);
    if (template) {
      // An exact match is treated as the strongest possible signal and returns
      // immediately as a local match.
      return this.buildMatchResult(fingerprint, template, false);
    }

    // When the exact fingerprint path fails, build layout features once from
    // the incoming document and use them for the best-template fallback path.
    const incomingLayoutFeatures = this.extractLayoutFeatures(document);
    const bestMatch = this.findBestMatchingTemplate(incomingLayoutFeatures);

    if (!bestMatch) {
      // When no suitable template is found, preserve the current no-match behavior.
      return this.buildMatchResult(fingerprint, undefined, false);
    }

    // Use the confidence engine to replace the previous fixed 90% threshold.
    // LOCAL and VALIDATE both return the matched template, while CLAUDE behaves
    // like the existing no-match result.
    const confidence = templateConfidenceEngine.calculate({
      exactMatchFound: false,
      similarityScore: bestMatch.similarityScore,
      templateAge: 0,
      templateUsageCount: 0,
      extractorConfidence: undefined,
    });

    if (confidence.decision === "LOCAL" || confidence.decision === "VALIDATE") {
      return this.buildMatchResult(
        fingerprint,
        bestMatch.template,
        confidence.decision === "VALIDATE"
      );
    }

    return this.buildMatchResult(fingerprint, undefined, false);
  }

  private computeFingerprint(document: DocumentModel): string {
    return layoutFingerprintEngine.generate(document);
  }

  private extractLayoutFeatures(document: DocumentModel) {
    return layoutFeatureExtractor.extract(document);
  }

  private lookupTemplate(fingerprint: string): TemplateRecord | undefined {
    return templateRepository.findByFingerprint(fingerprint);
  }

  private lookupTemplateDocument(
    fingerprint: string
  ): DocumentModel | undefined {
    return templateRepository.findTemplateDocumentByFingerprint(fingerprint);
  }

  private findBestMatchingTemplate(
    incomingLayoutFeatures: ReturnType<TemplateMatcher["extractLayoutFeatures"]>
  ): { template: TemplateRecord; similarityScore: number } | undefined {
    const storedTemplates = templateRepository.list();
    let bestMatch: { template: TemplateRecord; similarityScore: number } | undefined;

    // Compare the incoming document features against every stored template and
    // keep only the highest-scoring candidate so the confidence engine decides
    // whether that candidate should be accepted.
    for (const template of storedTemplates) {
      const storedDocument = this.parseTemplateDocument(template);
      if (!storedDocument) {
        continue;
      }

      const storedLayoutFeatures = this.extractLayoutFeatures(storedDocument);
      const similarity = templateSimilarityEngine.compare(
        incomingLayoutFeatures,
        storedLayoutFeatures
      );

      if (!bestMatch || similarity.score > bestMatch.similarityScore) {
        bestMatch = {
          template,
          similarityScore: similarity.score,
        };
      }
    }

    return bestMatch;
  }

  private parseTemplateDocument(template: TemplateRecord): DocumentModel | undefined {
    try {
      return JSON.parse(template.templateJson) as DocumentModel;
    } catch {
      return undefined;
    }
  }

  private buildMatchResult(
    fingerprint: string,
    template: TemplateRecord | undefined,
    validationRequired: boolean
  ): TemplateMatchResult {
    if (!template) {
      return {
        fingerprint,
        found: false,
      };
    }

    if (validationRequired) {
      return {
        fingerprint,
        found: true,
        template,
        validationRequired: true,
      };
    }

    return {
      fingerprint,
      found: true,
      template,
    };
  }
}

export default new TemplateMatcher();