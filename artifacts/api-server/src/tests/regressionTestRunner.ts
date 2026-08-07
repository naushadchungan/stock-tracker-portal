import type { RegressionTestCase, RegressionTestResult } from "./regressionTypes.js";

/**
 * Reusable regression-test runner for PDF extraction workflows.
 *
 * This class is intentionally architectural: it defines the contract for a
 * future regression suite without invoking Claude, parsing PDFs, or changing
 * the runtime matching and upload pipeline. In a later implementation, the
 * runner can plug into the extraction pipeline, parser selection, template
 * matching, and result comparison stages.
 */
export class RegressionTestRunner {
  /**
   * Run a single regression case.
   *
   * The method currently returns a structured result skeleton so future
   * extraction logic can be inserted behind the same interface.
   */
  run(test: RegressionTestCase): RegressionTestResult {
    const startedAt = Date.now();

    const errors: string[] = [];

    // Future implementation hook:
    // - resolve the PDF path
    // - run the extraction pipeline
    // - select the parser/template that was used
    // - compare the extracted item count with the expectation
    // - record any failures in the result object

    const extractedItemCount = 0;
    const passed = extractedItemCount === test.expectedItemCount;

    return {
      passed,
      extractedItemCount,
      expectedItemCount: test.expectedItemCount,
      parserUsed: "pending",
      templateMatched: test.expectedTemplate,
      processingTimeMs: Date.now() - startedAt,
      errors,
    };
  }

  /**
   * Run a collection of regression cases.
   */
  runAll(tests: RegressionTestCase[]): RegressionTestResult[] {
    return tests.map((test) => this.run(test));
  }
}

export default new RegressionTestRunner();
