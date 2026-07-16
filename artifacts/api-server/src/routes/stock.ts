import { Router } from "express";
import { db } from "@workspace/db";
import { stockItemsTable, depotsTable, uploadsTable } from "@workspace/db";
import { eq, sql, ilike, and, desc, count, asc, isNotNull } from "drizzle-orm";

const router = Router();

// GET /api/stock
router.get("/", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    const depotId = req.query.depotId ? parseInt(req.query.depotId as string, 10) : null;
    const brand = (req.query.brand as string) || null;
    const size = (req.query.size as string) || null;
    const finish = (req.query.finish as string) || null;
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(ilike(stockItemsTable.tileName, `%${search}%`));
    }
    if (depotId && !isNaN(depotId)) {
      conditions.push(eq(stockItemsTable.depotId, depotId));
    }
    if (brand) {
      conditions.push(eq(stockItemsTable.brand, brand));
    }
    if (size) {
      conditions.push(eq(stockItemsTable.size, size));
    }
    if (finish) {
      conditions.push(eq(stockItemsTable.finish, finish));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult, items] = await Promise.all([
      db
        .select({ total: count() })
        .from(stockItemsTable)
        .where(whereClause),
      db
        .select({
          id: stockItemsTable.id,
          depotId: stockItemsTable.depotId,
          depotName: depotsTable.name,
          tileName: stockItemsTable.tileName,
          brand: stockItemsTable.brand,
          size: stockItemsTable.size,
          design: stockItemsTable.design,
          finish: stockItemsTable.finish,
          boxCount: stockItemsTable.boxCount,
          pcsCount: stockItemsTable.pcsCount,
          stockDate: stockItemsTable.stockDate,
          uploadId: stockItemsTable.uploadId,
          updatedAt: stockItemsTable.updatedAt,
        })
        .from(stockItemsTable)
        .innerJoin(depotsTable, eq(depotsTable.id, stockItemsTable.depotId))
        .where(whereClause)
        .orderBy(asc(stockItemsTable.tileName))
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list stock");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stock/summary
router.get("/summary", async (req, res) => {
  try {
    const summary = await db
      .select({
        depotId: depotsTable.id,
        depotName: depotsTable.name,
        totalItems: count(stockItemsTable.id),
        totalBoxes: sql<number>`coalesce(sum(cast(${stockItemsTable.boxCount} as numeric)), 0)`,
        lastUploadAt: sql<string | null>`max(${uploadsTable.createdAt})`,
        stockDate: sql<string | null>`max(${stockItemsTable.stockDate})`,
      })
      .from(depotsTable)
      .leftJoin(stockItemsTable, eq(stockItemsTable.depotId, depotsTable.id))
      .leftJoin(uploadsTable, eq(uploadsTable.depotId, depotsTable.id))
      .groupBy(depotsTable.id, depotsTable.name)
      .orderBy(depotsTable.name);

    return res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get stock summary");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stock/filters
router.get("/filters", async (req, res) => {
  try {
    const depotId = req.query.depotId ? parseInt(req.query.depotId as string, 10) : null;
    const depotCondition = depotId && !isNaN(depotId) ? eq(stockItemsTable.depotId, depotId) : undefined;

    const [brands, sizes, finishes] = await Promise.all([
      db
        .selectDistinct({ brand: stockItemsTable.brand })
        .from(stockItemsTable)
        .where(and(isNotNull(stockItemsTable.brand), depotCondition))
        .orderBy(asc(stockItemsTable.brand)),
      db
        .selectDistinct({ size: stockItemsTable.size })
        .from(stockItemsTable)
        .where(and(isNotNull(stockItemsTable.size), depotCondition))
        .orderBy(asc(stockItemsTable.size)),
      db
        .selectDistinct({ finish: stockItemsTable.finish })
        .from(stockItemsTable)
        .where(and(isNotNull(stockItemsTable.finish), depotCondition))
        .orderBy(asc(stockItemsTable.finish)),
    ]);

    return res.json({
      brands: brands.map((b) => b.brand).filter(Boolean),
      sizes: sizes.map((s) => s.size).filter(Boolean),
      finishes: finishes.map((f) => f.finish).filter(Boolean),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stock filters");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
