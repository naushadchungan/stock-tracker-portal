import type { DocumentModel } from "../models/documentModel.js";
import type { LearningResult } from "../models/learningResult.js";

import claudeLearningEngine from "./claudeLearningEngine.js";
import templateMatcher from "./templateMatcher.js";
import templateRepository from "../repository/templateRepository.js";
import { validateLearnedTemplate } from "../validator/templateValidator.js";

export interface LearningCoordinatorResult {
  status: "known" | "learned";
  fingerprint: string;
  learningResult?: LearningResult;
}

export class LearningCoordinator {

  async process(
    rawText: string,
    document: DocumentModel
  ): Promise<LearningCoordinatorResult> {

    // 1. Check whether ADIE already knows this layout.
    const match = templateMatcher.match(document);

    if (match.found) {

      console.log(
        `ADIE: Known template detected (${match.fingerprint})`
      );

      return {
        status: "known",
        fingerprint: match.fingerprint,
      };
    }

    console.log(
      `ADIE: Unknown layout (${match.fingerprint})`
    );

    // 2. Ask Claude to study the unknown document.
    const learningResult =
      await claudeLearningEngine.learn(
        rawText,
        document
      );

    // 3. Validate what Claude taught us.
    const validation =
      validateLearnedTemplate(
        learningResult.template
      );

    if (!validation.valid) {
      throw new Error(
        `ADIE rejected learned template: ${validation.errors.join(
          "; "
        )}`
      );
    }

    // 4. Only save validated templates.
    templateRepository.save({
      fingerprint: match.fingerprint,

      supplier: null,

      version: 1,

      templateJson: JSON.stringify(
        learningResult.template
      ),

      confidence:
        learningResult.confidence,
    });

    console.log(
      `ADIE: Template learned and saved (${match.fingerprint})`
    );

    return {
      status: "learned",
      fingerprint: match.fingerprint,
      learningResult,
    };
  }
}

export default new LearningCoordinator();