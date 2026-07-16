import { Router } from "express";
import { db } from "@workspace/db";
import { depotsTable, uploadsTable, stockItemsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { DepotInput } from "@workspace/api-zod";

const router = Router();

// GET /api/depots
router.get("/", async (req, res) => {
  try {
    const depots = await db
      .select({
        id: depotsTable.id,
        name: depotsTable.name,
        location: depotsTable.location,
        createdAt: depotsTable.createdAt,
        lastUploadAt: sql<string | null>`max(${uploadsTable.createdAt})`.as("last_upload_at"),
        itemCount: sql<number>`count(distinct ${stockItemsTable.id})`.as("item_count"),
      })
      .from(depotsTable)
      .leftJoin(uploadsTable, eq(uploadsTable.depotId, depotsTable.id))
      .leftJoin(stockItemsTable, eq(stockItemsTable.depotId, depotsTable.id))
      .groupBy(depotsTable.id)
      .orderBy(depotsTable.name);

    res.json(depots);
  } catch (err) {
    req.log.error({ err }, "Failed to list depots");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/depots
router.post("/", async (req, res) => {
  try {
    const parsed = DepotInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid depot data" });
    }
    const [depot] = await db
      .insert(depotsTable)
      .values({ name: parsed.data.name, location: parsed.data.location })
      .returning();
    res.status(201).json({ ...depot, itemCount: 0 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return res.status(400).json({ error: "A depot with that name already exists" });
    }
    req.log.error({ err }, "Failed to create depot");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/depots/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [depot] = await db
      .select({
        id: depotsTable.id,
        name: depotsTable.name,
        location: depotsTable.location,
        createdAt: depotsTable.createdAt,
        lastUploadAt: sql<string | null>`max(${uploadsTable.createdAt})`.as("last_upload_at"),
        itemCount: sql<number>`count(distinct ${stockItemsTable.id})`.as("item_count"),
      })
      .from(depotsTable)
      .leftJoin(uploadsTable, eq(uploadsTable.depotId, depotsTable.id))
      .leftJoin(stockItemsTable, eq(stockItemsTable.depotId, depotsTable.id))
      .where(eq(depotsTable.id, id))
      .groupBy(depotsTable.id);

    if (!depot) return res.status(404).json({ error: "Depot not found" });
    res.json(depot);
  } catch (err) {
    req.log.error({ err }, "Failed to get depot");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
