import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { depotsTable } from "./depots";

export const uploadsTable = pgTable("uploads", {
  id: serial("id").primaryKey(),
  depotId: integer("depot_id").notNull().references(() => depotsTable.id),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | done | failed
  itemsExtracted: integer("items_extracted"),
  errorMessage: text("error_message"),
  stockDate: date("stock_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertUploadSchema = createInsertSchema(uploadsTable).omit({ id: true, createdAt: true });
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploadsTable.$inferSelect;
