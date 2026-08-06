import "../parsers/register";
import { createProfile } from "./profile";
import { recognizeDocument } from "./recognizer";

export function detectDocument(
  rawText: string,
  pageCount: number
) {
  const profile = createProfile(
    rawText,
    pageCount
  );

  const match = recognizeDocument(
    profile,
    rawText
  );

  if (!match) {
    return null;
  }

  console.log("Document Recognition");

  console.log(
    `Parser : ${match.parser.name}`
  );

  console.log(
    `Score  : ${match.result.score}`
  );

  console.log("Reasons:");

  for (const reason of match.result.reasons) {
    console.log(` - ${reason}`);
  }

  return match;
}