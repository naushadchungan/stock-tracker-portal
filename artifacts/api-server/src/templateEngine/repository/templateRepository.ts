import db from "../database/sqlite.js";

export interface TemplateRecord {
  id?: number;
  fingerprint: string;
  supplier?: string | null;
  version: number;
  templateJson: string;
  confidence: number;
}

export class TemplateRepository {
  /**
   * Find a template by fingerprint.
   */
  findByFingerprint(fingerprint: string): TemplateRecord | undefined {
    const stmt = db.prepare(`
      SELECT *
      FROM templates
      WHERE fingerprint = ?
      ORDER BY version DESC
      LIMIT 1
    `);

    return stmt.get(fingerprint) as TemplateRecord | undefined;
  }

  /**
   * Save a new template.
   */
  save(template: TemplateRecord): void {
    const stmt = db.prepare(`
      INSERT INTO templates
      (
        fingerprint,
        supplier,
        version,
        templateJson,
        confidence
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      template.fingerprint,
      template.supplier ?? null,
      template.version,
      template.templateJson,
      template.confidence
    );
  }

  /**
   * List all templates.
   */
  list(): TemplateRecord[] {
    const stmt = db.prepare(`
      SELECT *
      FROM templates
      ORDER BY id DESC
    `);

    return stmt.all() as TemplateRecord[];
  }
}

export default new TemplateRepository();