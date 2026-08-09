import { extractShreem } from "./extractor";
import type {
  DocumentParser,
  DocumentProfile,
  RecognitionResult,
  ParseResult,
} from "../interfaces";

import type { ParsedItem } from "../../types/pdf";

export class ShreemParser implements DocumentParser {

  id = "layoutA";

  name = "Shreem Parser";

supports(
  profile: DocumentProfile,
  rawText: string
): RecognitionResult {

  let score = 0;
  const reasons: string[] = [];

  if (rawText.includes("SHREEM")) {
    score += 20;
    reasons.push("Contains SHREEM");
  }

  if (rawText.includes("DESPATCH DATE")) {
    score += 20;
    reasons.push("Contains DESPATCH DATE");
  }

  if (rawText.includes("VITRIFIED")) {
    score += 10;
    reasons.push("Contains VITRIFIED");
  }

  const shreemLines =
    (rawText.match(/^4X2\s+SHREEM/gm) || []).length;

  if (shreemLines >= 5) {
    score += 40;
    reasons.push(`Found ${shreemLines} SHREEM stock lines`);
  }

  return {
    score,
    reasons
  };
}

  async parse(
  rawText: string,
  images: { b64: string; y: number; page: number }[]
): Promise<ParseResult> {

  const items = extractShreem(rawText);

  return {
    items,
    confidence: items.length > 0 ? 95 : 0
  };

}

}