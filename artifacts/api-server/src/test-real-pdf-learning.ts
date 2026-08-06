import dotenv from "dotenv";

dotenv.config({
  path: "../../.env",
});

console.log(
  "Anthropic key available:",
  !!process.env.ANTHROPIC_API_KEY
);

import fs from "node:fs";

import { extractPdf } from "./services/pdfExtractor.js";

import documentBuilder from "./templateEngine/builders/documentBuilder.js";
import templateMatcher from "./templateEngine/services/templateMatcher.js";
import learningCoordinator from "./templateEngine/services/learningCoordinator.js";
import learnedTemplateExtractor from "./templateEngine/extractors/learnedTemplateExtractor.js";

async function main() {
  console.log("\n====================================");
  console.log("ADIE REAL PDF LEARNING TEST");
  console.log("====================================\n");

  const pdfPath =
    "./test-pdfs/sample.pdf";

  if (!fs.existsSync(pdfPath)) {
    throw new Error(
      `PDF not found: ${pdfPath}`
    );
  }

  // --------------------------------------------------
  // 1. Read PDF
  // --------------------------------------------------

  const pdfBuffer =
    fs.readFileSync(pdfPath);

  console.log(
    "PDF loaded:",
    pdfBuffer.length,
    "bytes"
  );

  // --------------------------------------------------
  // 2. Extract PDF
  // --------------------------------------------------

  const {
    rawText,
    images,
    pageImages,
  } = await extractPdf(pdfBuffer);

  console.log(
    "Raw text length:",
    rawText.length
  );

  // --------------------------------------------------
  // RAW TEXT DIAGNOSTIC
  // --------------------------------------------------

  console.log(
    "\n===== RAW TEXT START ====="
  );

  console.log(
    rawText.substring(0, 12000)
  );

  console.log(
    "===== RAW TEXT END =====\n"
  );

  console.log(
    "Images:",
    images.length
  );

  console.log(
    "Page images:",
    pageImages.length
  );

  if (!rawText.trim()) {
    console.log(
      "\nIMAGE-ONLY PDF"
    );

    console.log(
      "This test currently requires a text-layer PDF."
    );

    return;
  }

  // --------------------------------------------------
  // 3. Build neutral document model
  // --------------------------------------------------

  const document =
    documentBuilder.build(rawText);

  console.log(
    "\nTables detected:",
    document.tables.length
  );

  // --------------------------------------------------
  // 4. Check ADIE memory
  // --------------------------------------------------

  const firstMatch =
    templateMatcher.match(document);

  console.log(
    "\nFingerprint:",
    firstMatch.fingerprint
  );

  console.log(
    "Template already known:",
    firstMatch.found
  );

  // --------------------------------------------------
  // KNOWN TEMPLATE
  // --------------------------------------------------

  if (
    firstMatch.found &&
    firstMatch.template
  ) {
    console.log(
      "\nADIE MEMORY HIT"
    );

    console.log(
      "Claude will NOT be called."
    );

    const template =
      JSON.parse(
        firstMatch.template.templateJson
      );

    const extraction =
      learnedTemplateExtractor.extract(
        document,
        template
      );

    console.log(
      "\nLOCAL EXTRACTION RESULT"
    );

    console.log(
      JSON.stringify(
        extraction,
        null,
        2
      )
    );

    return;
  }

  // --------------------------------------------------
  // UNKNOWN TEMPLATE
  // --------------------------------------------------

  console.log(
    "\nADIE MEMORY MISS"
  );

  console.log(
    "Claude will study this layout."
  );

  const learning =
    await learningCoordinator.process(
      rawText,
      document
    );

  console.log(
    "\nLEARNING STATUS:",
    learning.status
  );

  console.log(
    "FINGERPRINT:",
    learning.fingerprint
  );

  if (learning.learningResult) {
    console.log(
      "\nCLAUDE CONFIDENCE:",
      learning.learningResult.confidence
    );

    console.log(
      "\nEXTRACTED ITEMS:"
    );

    console.log(
      JSON.stringify(
        learning.learningResult.items,
        null,
        2
      )
    );

    console.log(
      "\nLEARNED TEMPLATE:"
    );

    console.log(
      JSON.stringify(
        learning.learningResult.template,
        null,
        2
      )
    );

    console.log(
      "\nWARNINGS:"
    );

    console.log(
      learning.learningResult.warnings
    );
  }

  // --------------------------------------------------
  // 5. Verify template was stored
  // --------------------------------------------------

  const secondMatch =
    templateMatcher.match(document);

  console.log(
    "\n===================================="
  );

  console.log(
    "MEMORY VERIFICATION"
  );

  console.log(
    "===================================="
  );

  console.log(
    "Template found after learning:",
    secondMatch.found
  );

  if (secondMatch.template) {
    console.log(
      "Template ID:",
      secondMatch.template.id
    );
  }

  console.log(
    "\nIMPORTANT:"
  );

  console.log(
    "No live depot stock was modified."
  );
}

main().catch((error) => {
  console.error(
    "\nADIE TEST FAILED"
  );

  console.error(error);

  process.exit(1);
});