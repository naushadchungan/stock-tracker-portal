import { detectDocument } from "./engine";

export async function testDocumentEngine(
  rawText: string,
  images: { b64: string; y: number; page: number }[]
) {
  console.log("TEST ENGINE STARTED");
  console.log("");
  console.log("====================================");
  console.log("DOCUMENT ENGINE TEST");
  console.log("====================================");

  const match = detectDocument(rawText, 1);

  if (!match) {
    console.log("No parser selected.");
    return;
  }

  console.log("");
  console.log("Running parser...");

  const result = await match.parser.parse(
    rawText,
    images
  );

  console.log("");
  console.log("Items Found :", result.items.length);
  console.log("Confidence :", result.confidence);

  return result;
}