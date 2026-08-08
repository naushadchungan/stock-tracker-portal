import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const learnedTemplatesTable = pgTable("learned_templates", {
  id: serial("id").primaryKey(),
  fingerprint: varchar("fingerprint", { length: 255 }).notNull().unique(),
  templateJson: text("template_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export type LearnedTemplateInsert = typeof learnedTemplatesTable.$inferInsert;
export type LearnedTemplate = typeof learnedTemplatesTable.$inferSelect;
