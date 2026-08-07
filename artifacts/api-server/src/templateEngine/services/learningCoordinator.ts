import type { DocumentModel } from "../models/documentModel.js";
import type { LearningResult } from "../models/learningResult.js";
import type { LearnedTemplateDefinition } from "../models/learnedTemplate.js";
import type { TemplateValidationResult } from "../validator/templateValidator.js";

import claudeLearningEngine from "./claudeLearningEngine.js";
import templateMatcher from "./templateMatcher.js";
import templateRepository from "../repository/templateRepository.js";
import templateStatisticsService from "./templateStatisticsService.js";
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

    // Learn the template from Claude, validate it, persist it, and then
    // initialize usage statistics so the new template is ready for future
    // matching and extraction flows.
    const learningResult = await this.learnTemplate(rawText, document);
    const validation = this.validateTemplate(learningResult.template);

    this.ensureTemplateIsValid(validation);
    const savedTemplate = this.persistLearnedTemplate(fingerprint, learningResult);
    // Initialize statistics for a successfully learned template and record the
    // extraction event once the save completed.
    this.initializeTemplateStatistics(fingerprint);
    templateStatisticsService.recordExtraction(fingerprint);

    return {
      status: "learned",
      fingerprint,
      learningResult: {
        ...learningResult,
        template: savedTemplate,
      },
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
  ): LearnedTemplateDefinition {
    const templateRecord = this.buildTemplateRecord(fingerprint, learningResult);
    templateRepository.save(templateRecord);
    console.log(`ADIE: Template learned and saved (${fingerprint})`);
    return learningResult.template;
  }

  private initializeTemplateStatistics(templateId: string) {
    if (!templateStatisticsService.get(templateId)) {
      templateStatisticsService.recordExtraction(templateId);
    }
  }
}

export default new LearningCoordinator();