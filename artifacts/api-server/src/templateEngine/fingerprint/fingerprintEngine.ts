import crypto from "crypto";

export class FingerprintEngine {
  /**
   * Generate a stable fingerprint from extracted PDF text.
   */
  generate(text: string): string {
    // Normalize text
    const normalized = text
      .replace(/\r\n/g, "\n")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    // Create SHA-256 hash
    return crypto
      .createHash("sha256")
      .update(normalized)
      .digest("hex");
  }
}

export default new FingerprintEngine();