import type {
  DocumentParser,
  DocumentProfile,
  ParseResult,
  RecognitionResult,
} from "../interfaces";

export class GenericParser implements DocumentParser {

  id = "generic";

  name = "Generic Parser";

  supports(
    profile: DocumentProfile,
    rawText: string
  ): RecognitionResult {

    if (!profile.hasText) {
      return {
        score: 0,
        reasons: [
          "PDF has no text layer"
        ]
      };
    }

    return {
      score: 10,
      reasons: [
        "Fallback parser"
      ]
    };
  }

  async parse(
    rawText: string,
    images: { b64: string; y: number; page: number }[]
  ): Promise<ParseResult> {

    return {
      items: [],
      confidence: 10
    };

  }

}