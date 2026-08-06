import type { DocumentModel } from "../models/documentModel.js";
import type { LearningResult } from "../models/learningResult.js";
import type { LearnedTemplateDefinition } from "../models/learnedTemplate.js";
import type { TemplateValidationResult } from "../validator/templateValidator.js";

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
  /**
   * Process a document for ADIE layout learning.
   *
   * If the layout is already known, this returns a short-circuit result.
   * Otherwise it learns, validates, and persists a new template record.
   */
  async process(
    rawText: string,
    document: DocumentModel
  ): Promise<LearningCoordinatorResult> {
    const { found, fingerprint } = this.matchKnownTemplate(document);

    if (found) {
      this.logKnownTemplate(fingerprint);
      return {
        status: "known",
        fingerprint,
      };
    }

    this.logUnknownTemplate(fingerprint);

    const learningResult = await this.learnTemplate(rawText, document);
    const validation = this.validateTemplate(learningResult.template);

    this.ensureTemplateIsValid(validation);
    this.persistLearnedTemplate(fingerprint, learningResult);

    return {
      status: "learned",
      fingerprint,
      learningResult,
    };
  }

  private matchKnownTemplate(document: DocumentModel) {
    return templateMatcher.match(document);
  }

  private logKnownTemplate(fingerprint: string) {
    console.log(`ADIE: Known template detected (${fingerprint})`);
  }

  private logUnknownTemplate(fingerprint: string) {
    console.log(`ADIE: Unknown layout (${fingerprint})`);
  }

  private async learnTemplate(
    rawText: string,
    document: DocumentModel
  ): Promise<LearningResult> {
    return claudeLearningEngine.learn(rawText, document);
  }

  private validateTemplate(template: LearnedTemplateDefinition): TemplateValidationResult {
    return validateLearnedTemplate(template);
  }

  private ensureTemplateIsValid(validation: TemplateValidationResult) {
    if (!validation.valid) {
      throw new Error(`ADIE rejected learned template: ${validation.errors.join("; ")}`);
    }
  }

  private buildTemplateRecord(
    fingerprint: string,
    learningResult: LearningResult
  ) {
    return {
      fingerprint,
      supplier: null,
      version: 1,
      templateJson: JSON.stringify(learningResult.template),
      confidence: learningResult.confidence,
    };
  }

  private persistLearnedTemplate(
    fingerprint: string,
    learningResult: LearningResult
  ) {
    templateRepository.save(this.buildTemplateRecord(fingerprint, learningResult));
    console.log(`ADIE: Template learned and saved (${fingerprint})`);
  }
}

export default new LearningCoordinator();