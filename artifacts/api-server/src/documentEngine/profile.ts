import type { DocumentProfile } from "../parsers/interfaces";

export function createProfile(
  rawText: string,
  pageCount: number
): DocumentProfile {

  return {
    hasText: rawText.trim().length > 0,

    pageCount,

    fingerprint: [],

    detectedLayout: undefined,

    detectedSupplier: undefined,
  };
}