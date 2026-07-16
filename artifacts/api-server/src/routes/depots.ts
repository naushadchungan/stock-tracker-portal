import { Router } from "express";
import { db } from "@workspace/db";
import { depotsTable, uploadsTable, stockItemsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateDepotBody, UpdateDepotBody } from "@workspace/api-zod";

const router = Router();

const depotSelect = {
  id: depotsTable.id,
  name: depotsTable.name,
  location: depotsTable.location,
  createdAt: depotsTable.createdAt,
  lastUploadAt: sql<string | null>`max(${uploadsTable.createdAt})`.as("last_upload_at"),
  itemCount: sql<number>`count(distinct ${stockItemsTable.id})`.as("item_count"),
};

// GET /api/depots
router.get("/", async (req, res) => {
  try {
    const depots = await db
      .select(depotSelect)
      .from(depotsTable)
      .leftJoin(uploadsTable, eq(uploadsTable.depotId, depotsTable.id))
      .leftJoin(stockItemsTable, eq(stockItemsTable.depotId, depotsTable.id))
      .groupBy(depotsTable.id)
      .orderBy(depotsTable.name);
    return res.json(depots);
  } catch (err) {
    req.log.error({ err }, "Failed to list depots");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/depots
router.post("/", async (req, res) => {
  try {
    const parsed = CreateDepotBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid depot data" });
    }
    const [depot] = await db
      .insert(depotsTable)
      .values({ name: parsed.data.name, location: parsed.data.location })
      .returning();
    return res.status(201).json({ ...depot, itemCount: 0 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return res.status(400).json({ error: "A depot with that name already exists" });
    }
    req.log.error({ err }, "Failed to create depot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/depots/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [depot] = await db
      .select(depotSelect)
      .from(depotsTable)
      .leftJoin(uploadsTable, eq(uploadsTable.depotId, depotsTable.id))
      .leftJoin(stockItemsTable, eq(stockItemsTable.depotId, depotsTable.id))
      .where(eq(depotsTable.id, id))
      .groupBy(depotsTable.id);

    if (!depot) return res.status(404).json({ error: "Depot not found" });
    return res.json(depot);
  } catch (err) {
    req.log.error({ err }, "Failed to get depot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/depots/:id
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const parsed = UpdateDepotBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid depot data" });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.location !== undefined) updates.location = parsed.data.location;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const [updated] = await db
      .update(depotsTable)
      .set(updates)
      .where(eq(depotsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Depot not found" });

    const [depot] = await db
      .select(depotSelect)
      .from(depotsTable)
      .leftJoin(uploadsTable, eq(uploadsTable.depotId, depotsTable.id))
      .leftJoin(stockItemsTable, eq(stockItemsTable.depotId, depotsTable.id))
      .where(eq(depotsTable.id, id))
      .groupBy(depotsTable.id);

    return res.json(depot);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return res.status(400).json({ error: "A depot with that name already exists" });
    }
    req.log.error({ err }, "Failed to update depot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/depots/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    // Check exists
    const [existing] = await db.select({ id: depotsTable.id }).from(depotsTable).where(eq(depotsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Depot not found" });

    // Delete in order: stock items → uploads → depot
    await db.delete(stockItemsTable).where(eq(stockItemsTable.depotId, id));
    await db.delete(uploadsTable).where(eq(uploadsTable.depotId, id));
    await db.delete(depotsTable).where(eq(depotsTable.id, id));

    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete depot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
