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
  match(document: DocumentModel): TemplateMatchResult {
    const fingerprint =
      layoutFingerprintEngine.generate(document);

    const template =
      templateRepository.findByFingerprint(fingerprint);

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