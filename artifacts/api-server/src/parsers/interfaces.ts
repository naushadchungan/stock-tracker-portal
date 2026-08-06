import type { ParsedItem } from "../types/pdf";

export interface DocumentProfile {
  hasText: boolean;
  pageCount: number;
  fingerprint: string[];

  detectedSupplier?: string;
  detectedLayout?: string;
}

export interface ParseResult {
  items: ParsedItem[];
  confidence: number;
}

export interface RecognitionResult {
  score: number;
  reasons: string[];
}

export interface DocumentParser {

  id: string;

  name: string;

  supports(
    profile: DocumentProfile,
    rawText: string
  ): RecognitionResult;

  parse(
    rawText: string,
    images: { b64: string; y: number; page: number }[]
  ): Promise<ParseResult>;
}