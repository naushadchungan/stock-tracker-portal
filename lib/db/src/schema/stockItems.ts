import { pgTable, serial, integer, text, timestamp, numeric, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { depotsTable } from "./depots";
import { uploadsTable } from "./uploads";

export const stockItemsTable = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  depotId: integer("depot_id").notNull().references(() => depotsTable.id),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id),
  tileName: text("tile_name").notNull(),
  brand: text("brand"),
  size: text("size"),
  design: text("design"),
  finish: text("finish"),
  boxCount: numeric("box_count", { precision: 10, scale: 2 }),
  pcsCount: numeric("pcs_count", { precision: 10, scale: 2 }),
  stockDate: date("stock_date"),
  imageData: text("image_data"),
  location: text("location"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("stock_depot_idx").on(table.depotId),
  index("stock_brand_idx").on(table.brand),
  index("stock_size_idx").on(table.size),
]);

export const insertStockItemSchema = createInsertSchema(stockItemsTable).omit({ id: true, updatedAt: true });
export type InsertStockItem = z.infer<typeof insertStockItemSchema>;
export type StockItem = typeof stockItemsTable.$inferSelect;
