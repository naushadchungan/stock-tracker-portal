import type {
  LearnedTemplateDefinition,
  StockUnit,
} from "../models/learnedTemplate.js";

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
}

const ALLOWED_STOCK_UNITS: StockUnit[] = [
  "box",
  "pcs",
  "both",
  "unknown",
];

const ALLOWED_FIELDS = [
  "itemName",
  "size",
  "finish",
  "stock",
  "brand",
  "dispatchDate",
  "photo",
];

const ALLOWED_SOURCES = [
  "column",
  "line",
  "header",
  "nearby_text",
  "image",
];

export function validateLearnedTemplate(
  template: LearnedTemplateDefinition
): TemplateValidationResult {
  const errors: string[] = [];

  // --------------------------------------------------
  // Basic template checks
  // --------------------------------------------------

  if (!template) {
    return {
      valid: false,
      errors: ["Template is missing."],
    };
  }

  if (template.schemaVersion !== 1) {
    errors.push(
      "Unsupported schemaVersion."
    );
  }

  if (
    template.documentType !==
    "tile_stock_report"
  ) {
    errors.push(
      "Invalid documentType."
    );
  }

  // --------------------------------------------------
  // Field rules
  // --------------------------------------------------

  if (
    !Array.isArray(template.fields) ||
    template.fields.length === 0
  ) {
    errors.push(
      "Template must contain field rules."
    );
  } else {
    for (
      let i = 0;
      i < template.fields.length;
      i++
    ) {
      const rule = template.fields[i];

      if (
        !ALLOWED_FIELDS.includes(
          rule.field
        )
      ) {
        errors.push(
          `Field rule ${i}: invalid field "${rule.field}".`
        );
      }

      if (
        !ALLOWED_SOURCES.includes(
          rule.source
        )
      ) {
        errors.push(
          `Field rule ${i}: invalid source "${rule.source}".`
        );
      }

      // COLUMN source must have a valid column index.
      if (
        rule.source === "column" &&
        (
          typeof rule.columnIndex !==
            "number" ||
          rule.columnIndex < 0 ||
          !Number.isInteger(
            rule.columnIndex
          )
        )
      ) {
        errors.push(
          `Field rule ${i}: column source requires a valid zero-based columnIndex.`
        );
      }

      // HEADER can be identified either by a fixed
      // label or by a structural pattern.
      if (
        rule.source === "header" &&
        !rule.label &&
        !rule.pattern
      ) {
        errors.push(
          `Field rule ${i}: header source requires a label or pattern.`
        );
      }

      if (
        rule.label !== undefined &&
        typeof rule.label !== "string"
      ) {
        errors.push(
          `Field rule ${i}: label must be a string.`
        );
      }

      if (
        rule.pattern !== undefined &&
        typeof rule.pattern !== "string"
      ) {
        errors.push(
          `Field rule ${i}: pattern must be a string.`
        );
      }

      if (
        typeof rule.required !==
        "boolean"
      ) {
        errors.push(
          `Field rule ${i}: required must be boolean.`
        );
      }
    }
  }

  // --------------------------------------------------
  // Row rule
  // --------------------------------------------------

  if (!template.rowRule) {
    errors.push(
      "rowRule is required."
    );
  } else {
    if (
      typeof template.rowRule.minimumFields !==
        "number" ||
      template.rowRule.minimumFields < 1 ||
      !Number.isInteger(
        template.rowRule.minimumFields
      )
    ) {
      errors.push(
        "rowRule.minimumFields must be a positive integer."
      );
    }

    if (
      typeof template.rowRule.multiline !==
      "boolean"
    ) {
      errors.push(
        "rowRule.multiline must be boolean."
      );
    }

    if (
      template.rowRule.startPattern !==
        undefined &&
      template.rowRule.startPattern !==
        null &&
      typeof template.rowRule.startPattern !==
        "string"
    ) {
      errors.push(
        "rowRule.startPattern must be a string when provided."
      );
    }
  }

  // --------------------------------------------------
  // Stock definition
  // --------------------------------------------------

  if (!template.stockDefinition) {
    errors.push(
      "stockDefinition is required."
    );
  } else {
    const stock =
      template.stockDefinition;

    if (
      !ALLOWED_STOCK_UNITS.includes(
        stock.unit
      )
    ) {
      errors.push(
        `Invalid stockDefinition.unit "${stock.unit}".`
      );
    }

    if (
      stock.boxColumnIndex !==
        undefined &&
      stock.boxColumnIndex !== null &&
      (
        typeof stock.boxColumnIndex !==
          "number" ||
        stock.boxColumnIndex < 0 ||
        !Number.isInteger(
          stock.boxColumnIndex
        )
      )
    ) {
      errors.push(
        "stockDefinition.boxColumnIndex must be a valid zero-based integer."
      );
    }

    if (
      stock.pcsColumnIndex !==
        undefined &&
      stock.pcsColumnIndex !== null &&
      (
        typeof stock.pcsColumnIndex !==
          "number" ||
        stock.pcsColumnIndex < 0 ||
        !Number.isInteger(
          stock.pcsColumnIndex
        )
      )
    ) {
      errors.push(
        "stockDefinition.pcsColumnIndex must be a valid zero-based integer."
      );
    }

    if (
      stock.piecesPerBox !==
        undefined &&
      stock.piecesPerBox !== null &&
      (
        typeof stock.piecesPerBox !==
          "number" ||
        stock.piecesPerBox <= 0
      )
    ) {
      errors.push(
        "stockDefinition.piecesPerBox must be greater than zero."
      );
    }

    if (
      stock.piecesPerBoxVariable !==
        undefined &&
      typeof stock.piecesPerBoxVariable !==
        "boolean"
    ) {
      errors.push(
        "stockDefinition.piecesPerBoxVariable must be boolean."
      );
    }

    // --------------------------------------------------
    // Semantic stock checks
    // --------------------------------------------------

    if (
      stock.unit === "box" &&
      (
        stock.boxColumnIndex ===
          undefined ||
        stock.boxColumnIndex === null
      )
    ) {
      errors.push(
        "BOX stock requires boxColumnIndex."
      );
    }

    if (
      stock.unit === "pcs" &&
      (
        stock.pcsColumnIndex ===
          undefined ||
        stock.pcsColumnIndex === null
      )
    ) {
      errors.push(
        "PCS stock requires pcsColumnIndex."
      );
    }

    if (stock.unit === "both") {
      if (
        stock.boxColumnIndex ===
          undefined ||
        stock.boxColumnIndex === null
      ) {
        errors.push(
          "BOTH stock requires boxColumnIndex."
        );
      }

      if (
        stock.pcsColumnIndex ===
          undefined ||
        stock.pcsColumnIndex === null
      ) {
        errors.push(
          "BOTH stock requires pcsColumnIndex."
        );
      }

      if (
        stock.boxColumnIndex !==
          undefined &&
        stock.boxColumnIndex !== null &&
        stock.pcsColumnIndex !==
          undefined &&
        stock.pcsColumnIndex !== null &&
        stock.boxColumnIndex ===
          stock.pcsColumnIndex
      ) {
        errors.push(
          "BOX and PCS cannot use the same column."
        );
      }
    }
  }

  // --------------------------------------------------
  // Structural anchors
  // --------------------------------------------------

  if (
    !Array.isArray(
      template.structuralAnchors
    )
  ) {
    errors.push(
      "structuralAnchors must be an array."
    );
  } else {
    for (
      let i = 0;
      i < template.structuralAnchors.length;
      i++
    ) {
      if (
        typeof template.structuralAnchors[i] !==
        "string"
      ) {
        errors.push(
          `structuralAnchors[${i}] must be a string.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}