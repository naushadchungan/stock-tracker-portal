export class LayoutSignature {
  /**
   * Remove variable data and keep only the document structure.
   */
  generate(text: string): string {
    return text
      // Remove numbers
      .replace(/\d+([.,]\d+)?/g, "#")

      // Remove long IDs
      .replace(/[A-Z0-9]{8,}/gi, "#")

      // Normalize whitespace
      .replace(/\s+/g, " ")

      // Lowercase
      .trim()
      .toLowerCase();
  }
}

export default new LayoutSignature();