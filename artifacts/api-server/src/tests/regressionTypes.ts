export interface RegressionTestCase {
  name: string;
  pdfPath: string;
  expectedItemCount: number;
  expectedTemplate?: string;
  expectedBrandCount?: number;
}

export interface RegressionTestResult {
  passed: boolean;
  extractedItemCount: number;
  expectedItemCount: number;
  parserUsed: string;
  templateMatched?: string;
  processingTimeMs: number;
  errors: string[];
}
