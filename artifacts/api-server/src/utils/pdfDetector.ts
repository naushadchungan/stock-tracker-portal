import { PDFParse } from "pdf-parse";

export interface PdfDetectionResult {
  isSearchable: boolean;
  textLength: number;
  pageCount: number;
  extractedText: string;
}

export async function detectPdfType(
  buffer: Buffer
): Promise<PdfDetectionResult> {
  const parser = new PDFParse({ data: buffer });

  try {
    const pdf = await parser.getText();
    const text = (pdf?.text || "").trim();

    return {
      isSearchable: text.length > 500,
      textLength: text.length,
      pageCount: 0,
      extractedText: text,
    };
  } finally {
    await parser.destroy();
  }
}