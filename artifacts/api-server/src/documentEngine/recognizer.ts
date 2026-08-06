import { getRegisteredParsers } from "./parserRegistry";
import type {
  DocumentProfile,
  DocumentParser,
  RecognitionResult,
} from "../parsers/interfaces";

export interface RecognitionMatch {
  parser: DocumentParser;
  result: RecognitionResult;
}

export function recognizeDocument(
  profile: DocumentProfile,
  rawText: string
): RecognitionMatch | null {

  const parsers = getRegisteredParsers();

  let bestMatch: RecognitionMatch | null = null;

  for (const parser of parsers) {

    const result = parser.supports(profile, rawText);

    if (
      !bestMatch ||
      result.score > bestMatch.result.score
    ) {
      bestMatch = {
        parser,
        result,
      };
    }
  }

  return bestMatch;
}