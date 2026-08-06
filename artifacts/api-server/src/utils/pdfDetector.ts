import pdfParse from "pdf-parse";

export interface PdfDetectionResult {
  isSearchable: boolean;
  textLength: number;
  pageCount: number;
  extractedText: string;
}

export async function detectPdfType(
  buffer: Buffer
): Promise<PdfDetectionResult> {

  const pdf = await pdfParse(buffer);

  const text = (pdf.text || "").trim();

  return {
    isSearchable: text.length > 500,
    textLength: text.length,
    pageCount: pdf.numpages,
    extractedText: text,
  };
}