import db from "../database/sqlite.js";

export interface TemplateRecord {
  id?: number;
  fingerprint: string;
  supplier?: string | null;
  version: number;
  templateJson: string;
  confidence: number;
}

const FIND_BY_FINGERPRINT_SQL = `
  SELECT *
  FROM templates
  WHERE fingerprint = ?
  ORDER BY version DESC
  LIMIT 1
`;

const SAVE_TEMPLATE_SQL = `
  INSERT INTO templates
  (
    fingerprint,
    supplier,
    version,
    templateJson,
    confidence
  )
  VALUES (?, ?, ?, ?, ?)
`;

const LIST_TEMPLATES_SQL = `
  SELECT *
  FROM templates
  ORDER BY id DESC
`;

export class TemplateRepository {
  /**
   * Find the most recent template for a fingerprint.
   */
  findByFingerprint(fingerprint: string): TemplateRecord | undefined {
    const stmt = db.prepare(FIND_BY_FINGERPRINT_SQL);
    return stmt.get(fingerprint) as TemplateRecord | undefined;
  }

  /**
   * Persists a new template row.
   *
   * The template record is append-only to preserve historical versions.
   */
  save(template: TemplateRecord): void {
    const stmt = db.prepare(SAVE_TEMPLATE_SQL);
    stmt.run(
      template.fingerprint,
      template.supplier ?? null,
      template.version,
      template.templateJson,
      template.confidence
    );
  }

  /**
   * List all templates in reverse insertion order.
   */
  list(): TemplateRecord[] {
    const stmt = db.prepare(LIST_TEMPLATES_SQL);
    return stmt.all() as TemplateRecord[];
  }
}

export default new TemplateRepository();