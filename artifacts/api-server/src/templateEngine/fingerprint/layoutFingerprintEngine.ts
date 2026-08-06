import crypto from "crypto";
import type { DocumentModel } from "../models/documentModel.js";

export class LayoutFingerprintEngine {

  generate(document: DocumentModel): string {

    const normalizedHeaders =
      document.layout.headers.map(header =>
        this.normalizeStructuralText(header)
      );

    const columns =
      document.tables.map(table =>
        table.columns.map(column =>
          this.normalizeStructuralText(column.name)
        )
      );

    const fingerprintData = {
      headers: normalizedHeaders,
      columns,
      tableCount: document.tables.length,
    };

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(fingerprintData))
      .digest("hex");
  }

  private normalizeStructuralText(
    text: string
  ): string {

    return text
      .toLowerCase()

      // Dates
      .replace(
        /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g,
        "#date"
      )

      // Long numeric values / report numbers
      .replace(/\b\d{4,}\b/g, "#num")

      // Smaller changing numeric values
      .replace(/\b\d+\b/g, "#")

      // Multiple spaces
      .replace(/\s+/g, " ")

      .trim();
  }
}

export default new LayoutFingerprintEngine();