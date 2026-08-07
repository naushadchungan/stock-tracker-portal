import { DocumentModel } from "../models/documentModel.js";
import layoutFingerprintEngine from "../fingerprint/layoutFingerprintEngine.js";
import layoutFeatureExtractor from "../features/layoutFeatureExtractor.js";
import templateRepository, {
  TemplateRecord,
} from "../repository/templateRepository.js";
import templateSimilarityEngine from "./templateSimilarityEngine.js";

export interface TemplateMatchResult {
  fingerprint: string;
  found: boolean;
  template?: TemplateRecord;
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
    // Build layout features once from the incoming document so the same
    // feature object can be reused across the exact-match and fallback paths.
    const incomingLayoutFeatures = this.extractLayoutFeatures(document);
    const fingerprint = this.computeFingerprint(document);

    // Preserve the existing exact fingerprint lookup first.
    const template = this.lookupTemplate(fingerprint);
    if (template) {
      return this.buildMatchResult(fingerprint, template);
    }

    // When the exact fingerprint does not resolve, use the repository-backed
    // template documents to compare layout features with the new engine.
    const similarTemplate = this.findSimilarTemplate(incomingLayoutFeatures);
    return this.buildMatchResult(fingerprint, similarTemplate);
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

  private findSimilarTemplate(
    incomingLayoutFeatures: ReturnType<TemplateMatcher["extractLayoutFeatures"]>
  ): TemplateRecord | undefined {
    const storedTemplates = templateRepository.list();

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

      if (similarity.score >= 90) {
        return template;
      }
    }

    return undefined;
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
    template: TemplateRecord | undefined
  ): TemplateMatchResult {
    if (!template) {
      return {
        fingerprint,
        found: false,
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