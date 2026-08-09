import type { LearnedTemplateDefinition } from "../models/learnedTemplate";
import type { ParsedItem } from "../../types/pdf";

export interface LearningResult {

    success: boolean;

    template: LearnedTemplateDefinition;

    items: ParsedItem[];

    confidence: number;

    warnings: string[];

    fingerprint: string;

    supplierName: string | null;

}