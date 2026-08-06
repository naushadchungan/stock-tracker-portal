import Anthropic from "@anthropic-ai/sdk";

import type { DocumentModel } from "../models/documentModel.js";
import type { LearningResult } from "../models/learningResult.js";

export class ClaudeLearningEngine {
  /**
   * Create the Anthropic client only when Claude is actually needed.
   * This avoids environment-loading timing problems in standalone tests.
   */
  private getClient(): Anthropic {
    const apiKey =
      process.env.ANTHROPIC_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured"
      );
    }

    return new Anthropic({
      apiKey,
    });
  }

  /**
   * Read the Claude model from environment configuration.
   */
  private getModel(): string {
    const model =
      process.env.ANTHROPIC_MODEL?.trim();

    if (!model) {
      throw new Error(
        "ANTHROPIC_MODEL is not configured"
      );
    }

    return model;
  }

  async learn(
    rawText: string,
    document: DocumentModel
  ): Promise<LearningResult> {
    console.log(
      "ADIE: Claude learning started"
    );

    if (!rawText.trim()) {
      throw new Error(
        "Cannot teach Claude from empty PDF text"
      );
    }

    const client =
      this.getClient();

    const model =
      this.getModel();

    const prompt =
      this.buildPrompt(
        rawText,
        document
      );

    console.log(
      `ADIE: Using Claude model ${model}`
    );

    const response =
      await client.messages.create({
        model,

        // Large enough for a full stock report +
        // learned template JSON.
        max_tokens: 20000,

        // ADIE needs deterministic structured JSON.
        // We do not need extended/adaptive thinking
        // for this learning request.
        thinking: {
          type: "disabled",
        },

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    const textBlock =
      response.content.find(
        (block) =>
          block.type === "text"
      );

    if (
      !textBlock ||
      textBlock.type !== "text"
    ) {
      console.error(
        "ADIE: Claude returned no text block"
      );

      console.error(
        "Stop reason:",
        response.stop_reason
      );

      console.error(
        "Content block types:",
        response.content.map(
          (block) => block.type
        )
      );

      console.error(
        "Usage:",
        response.usage
      );

      throw new Error(
        `Claude returned no text response. Stop reason: ${response.stop_reason}`
      );
    }

    const result =
      this.parseResponse(
        textBlock.text
      );

    console.log(
      `ADIE: Claude learning completed with confidence ${result.confidence}`
    );

    return result;
  }

  private buildPrompt(
    rawText: string,
    document: DocumentModel
  ): string {
    return `
You are the learning component of ADIE
(Adaptive Document Intelligence Engine).

ADIE processes TILE STOCK REPORT PDFs.

Your task is NOT merely to extract this document.

Your main task is to TEACH ADIE how this document
layout works so that future PDFs with the SAME
STRUCTURE can be processed locally without AI.

==================================================
GOAL
==================================================

Perform TWO jobs:

1. Extract the tile stock items from THIS document.

2. Produce reusable structural extraction rules
   describing HOW the document should be parsed
   next time without Claude.

==================================================
FIELDS ADIE NEEDS
==================================================

For each tile product determine when available:

- itemName
- size
- finish
- stock
- brand
- dispatchDate
- photo

Never invent missing information.

If a value cannot be determined reliably,
return null.

==================================================
VERY IMPORTANT: LEARN STRUCTURE, NOT IDENTITY
==================================================

Do NOT create recognition rules based primarily on:

- supplier names
- manufacturer names
- brand names
- tile design names
- individual product names

These values may change.

BAD learning rule:

"Document contains SHREEM"

BAD learning rule:

"Product starts with BEETHAS"

BAD learning rule:

"Use this template when SUZORA exists"

GOOD learning rule:

"Product rows contain a size followed by
description and two numeric stock columns"

GOOD learning rule:

"Finish is declared in the section heading
above the product rows"

GOOD learning rule:

"Dispatch date follows the label
DESPATCH DATE"

GOOD learning rule:

"The first stock number represents boxes
and the second represents loose pieces"

==================================================
STOCK SEMANTICS
==================================================

You MUST determine what the stock numbers mean.

Possible stock units:

"box"
"pcs"
"both"
"unknown"

If the document has BOTH box quantity and
loose-piece quantity:

stockDefinition.unit = "both"

and identify:

boxColumnIndex
pcsColumnIndex

If only boxes are present:

stockDefinition.unit = "box"

If only pieces are present:

stockDefinition.unit = "pcs"

If the meaning cannot be reliably determined:

stockDefinition.unit = "unknown"

DO NOT guess.

==================================================
PIECES PER BOX
==================================================

Some tile sections may contain information such as:

(2 PCS)
(3 PCS)
(4 PCS)

This may indicate pieces per box.

Determine whether pieces-per-box is:

- fixed for the whole document
- variable by section/product
- unavailable

Examples:

If the whole report uses 2 pieces per box:

"piecesPerBox": 2
"piecesPerBoxVariable": false

If one section says 2 PCS and another says 3 PCS:

"piecesPerBoxVariable": true

Do not set a fixed piecesPerBox when it varies.

==================================================
MULTILINE PRODUCT ROWS
==================================================

PDF text extraction frequently breaks one logical
product row across multiple physical lines.

Example:

4X2 PRODUCT ALPHA GREY
218 0

This may represent ONE product.

Another example:

4X2 PRODUCT BETA
0 0
(RANDOM 4)

may also represent ONE product.

You must determine whether logical rows can span
multiple lines.

Set:

"multiline": true

when continuation lines must be combined.

==================================================
SECTION-LEVEL INFORMATION
==================================================

Some values may be defined by a section heading
rather than repeated on every product.

Examples:

VITRIFIED (3 PCS) (GLOSSY)

or:

HIGH GLOSSY

A section heading may define:

- finish
- pieces per box
- product category
- other context

If finish comes from the nearest section heading,
learn that structurally.

Do NOT hard-code the actual section's brand name
as the recognition mechanism.

==================================================
SIZE
==================================================

Tile size may appear in formats such as:

4X2
4 X 2
1200X600
1200 X 600
600X600
800X800

Learn how size is positioned relative to the
product description.

Do not assume one specific size.

==================================================
DISPATCH DATE
==================================================

Dispatch date may appear as:

DESPATCH DATE : 05-07-2026

DISPATCH DATE : 05-07-2026

or similar structural labels.

Learn the label/pattern.

The actual date itself must NOT become part of
the template identity.

==================================================
PHOTO
==================================================

If product images are present, indicate that photo
association is required.

Do not invent photo references from raw text.

Actual image-to-product mapping will be handled
by another ADIE component.

==================================================
COLUMN INDEX RULE
==================================================

columnIndex values are ZERO BASED.

Example:

Item | Size | Finish | Box | PCS

means:

Item   = 0
Size   = 1
Finish = 2
Box    = 3
PCS    = 4

==================================================
CONFIDENCE
==================================================

confidence must be between 0 and 100.

Use high confidence only when:

- row structure is clear
- stock meaning is clear
- extracted values are internally consistent

Lower confidence when:

- columns are ambiguous
- stock meaning is unclear
- rows are badly fragmented
- important labels are missing
==================================================
FIELD SOURCE RULES - STRICT ENUM
==================================================

Every template.fields[].source MUST be exactly
ONE of the following values:

"column"
"line"
"header"
"nearby_text"
"image"

NO OTHER source values are allowed.

Do NOT invent descriptive source names.

For example, NEVER return:

"row_prefix"
"row_remainder"
"section_heading"
"row_or_section_first_word"
"trailing_number_pair"
"label_pattern"
"external"

Instead map structural concepts to ADIE's
supported source types:

- A value located at a table/row position:
  source = "column"

- A value extracted from the product line itself:
  source = "line"

- A value inherited from a section heading:
  source = "header"

- A value found near the product row or surrounding
  text:
  source = "nearby_text"

- A product photo:
  source = "image"

Use label, columnIndex and pattern to describe
HOW the value should be located.

Examples:

{
  "field": "itemName",
  "source": "line",
  "pattern": "...",
  "required": true
}

{
  "field": "finish",
  "source": "header",
  "pattern": "...",
  "required": false
}

{
  "field": "dispatchDate",
  "source": "header",
  "label": "DESPATCH DATE",
  "required": false
}

{
  "field": "photo",
  "source": "image",
  "required": false
}

The generated template MUST conform exactly to
the ADIE schema. Do not introduce new enum values,
property names, or extraction concepts.
==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

NO markdown.

NO code fences.

NO explanation outside JSON.

Use exactly this general structure:

{
  "documentType": "tile_stock_report",

  "confidence": 0,

  "items": [
    {
      "itemName": null,
      "size": null,
      "finish": null,
      "stock": null,
      "brand": null,
      "dispatchDate": null,
      "photoRef": null
    }
  ],

  "template": {
    "schemaVersion": 1,

    "documentType": "tile_stock_report",

    "fields": [
  {
    "field": "itemName",
    "source": "line",
    "pattern": null,
    "required": true
  },
  {
    "field": "size",
    "source": "line",
    "pattern": null,
    "required": false
  },
  {
    "field": "finish",
    "source": "header",
    "pattern": null,
    "required": false
  },
  {
    "field": "stock",
    "source": "line",
    "pattern": null,
    "required": true
  },
  {
    "field": "brand",
    "source": "nearby_text",
    "pattern": null,
    "required": false
  },
  {
    "field": "dispatchDate",
    "source": "header",
    "label": "DESPATCH DATE",
    "pattern": null,
    "required": false
  },
  {
    "field": "photo",
    "source": "image",
    "required": false
  }
],

    "rowRule": {
      "startPattern": null,
      "minimumFields": 2,
      "multiline": true
    },

    "stockDefinition": {
      "unit": "unknown",
      "boxColumnIndex": null,
      "pcsColumnIndex": null,
      "piecesPerBox": null,
      "piecesPerBoxVariable": false
    },

    "structuralAnchors": [],

    "learningNotes": []
  },

  "warnings": []
}

==================================================
STRUCTURAL ANCHORS
==================================================

structuralAnchors must contain stable layout clues.

Good examples:

"DESPATCH DATE"
"STOCK"
"QTY"
"ITEM"
"SIZE"
"FINISH"

Avoid using supplier/brand/product identity
unless absolutely necessary.

==================================================
DOCUMENT MODEL
==================================================

${JSON.stringify(document, null, 2)}

==================================================
RAW EXTRACTED TEXT
==================================================

${rawText}
`;
  }

  private parseResponse(
    responseText: string
  ): LearningResult {
    let cleaned =
      responseText.trim();

    // Defensive cleanup in case Claude
    // accidentally returns JSON inside a code fence.
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    let parsed: unknown;

    try {
      parsed =
        JSON.parse(cleaned);
    } catch {
      console.error(
        "ADIE: Claude JSON parse failure"
      );

      // Limit log size if Claude returns
      // a very large malformed response.
      console.error(
        cleaned.substring(0, 2000)
      );

      throw new Error(
        "Claude returned invalid learning JSON"
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      throw new Error(
        "Claude returned an invalid learning result"
      );
    }

    return parsed as LearningResult;
  }
}

export default new ClaudeLearningEngine();