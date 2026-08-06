import { DocumentModel } from "../models/documentModel.js";
import layoutFingerprintEngine from "../fingerprint/layoutFingerprintEngine.js";
import templateRepository, {
  TemplateRecord,
} from "../repository/templateRepository.js";

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
   * fingerprint.
   */
  match(document: DocumentModel): TemplateMatchResult {
    const fingerprint = this.computeFingerprint(document);
    const template = this.lookupTemplate(fingerprint);
    return this.buildMatchResult(fingerprint, template);
  }

  private computeFingerprint(document: DocumentModel): string {
    return layoutFingerprintEngine.generate(document);
  }

  private lookupTemplate(fingerprint: string): TemplateRecord | undefined {
    return templateRepository.findByFingerprint(fingerprint);
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