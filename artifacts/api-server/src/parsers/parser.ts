import {
  DocumentParser,
  DocumentProfile,
  ParseResult,
  RecognitionResult,
} from "../interfaces";

import { parseTextPdf } from "../../services/textParser";

export class StanzaParser implements DocumentParser {

  id = "stanza";

  name = "Stanza Parser";

  supports(
    profile: DocumentProfile,
    rawText: string
  ): RecognitionResult {

    if (
      rawText.includes("800X") ||
      rawText.includes("600X")
    ) {
      return {
        score: 90,
        reasons: [
          "Detected tile size pattern"
        ]
      };
    }

    return {
      score: 0,
      reasons: [
        "Not a Stanza document"
      ]
    };

  }

  async parse(
    rawText: string,
    images: { b64: string; y: number; page: number }[]
  ): Promise<ParseResult> {

    return {
      items: parseTextPdf(rawText, images),
      confidence: 90
    };

  }

}