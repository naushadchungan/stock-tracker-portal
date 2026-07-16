import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const depotsTable = pgTable("depots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDepotSchema = createInsertSchema(depotsTable).omit({ id: true, createdAt: true });
export type InsertDepot = z.infer<typeof insertDepotSchema>;
export type Depot = typeof depotsTable.$inferSelect;
