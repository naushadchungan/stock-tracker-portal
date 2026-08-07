import { extractPdf } from "../services/pdfExtractor";
import { Router } from "express";
import multer from "multer";

import { db } from "@workspace/db";
import {
  uploadsTable,
  stockItemsTable,
  depotsTable,
} from "@workspace/db";

import { eq, desc } from "drizzle-orm";

import { requireAdmin } from "../middlewares/requireAuth";

import type { ParsedItem } from "../types/pdf";

import { parseViaVision } from "../services/visionParser";
import { parseViaClaude } from "../services/claudeParser";

import { detectDocument } from "../documentEngine/engine";

import documentBuilder from "../templateEngine/builders/documentBuilder";
import templateMatcher from "../templateEngine/services/templateMatcher";
import learningCoordinator from "../templateEngine/services/learningCoordinator";
import learnedTemplateExtractor from "../templateEngine/extractors/learnedTemplateExtractor";

import type { LearnedTileItem } from "../templateEngine/models/learningResult";


// ============================================================
// ROUTER
// ============================================================

const router = Router();

type UploadRouteRequest = {
  log: {
    error: (fields: Record<string, unknown>, message: string) => void;
  };
};

interface UploadProcessingMetadata {
  parserUsed: string | null;
  templateMatched: string | null;
  similarityScore: number | null;
  confidenceScore: number | null;
  confidenceDecision: "LOCAL" | "VALIDATE" | "CLAUDE" | null;
  claudeUsed: boolean | null;
  processingTimeMs: number | null;
  validationRequired: boolean | null;
}

const uploadProcessingMetadata = new Map<number, UploadProcessingMetadata>();

function createUploadProcessingMetadata(): UploadProcessingMetadata {
  return {
    parserUsed: null,
    templateMatched: null,
    similarityScore: null,
    confidenceScore: null,
    confidenceDecision: null,
    claudeUsed: null,
    processingTimeMs: null,
    validationRequired: null,
  };
}

function ensureUploadProcessingMetadata(uploadId: number): UploadProcessingMetadata {
  const existing = uploadProcessingMetadata.get(uploadId);
  if (existing) {
    return existing;
  }

  const metadata = createUploadProcessingMetadata();
  uploadProcessingMetadata.set(uploadId, metadata);
  return metadata;
}

function patchUploadProcessingMetadata(
  uploadId: number,
  patch: Partial<UploadProcessingMetadata>
): void {
  const metadata = ensureUploadProcessingMetadata(uploadId);
  Object.assign(metadata, patch);
  uploadProcessingMetadata.set(uploadId, metadata);
}

function serializeUploadProcessingMetadata(uploadId: number) {
  const metadata = uploadProcessingMetadata.get(uploadId) ?? createUploadProcessingMetadata();
  return {
    parserUsed: metadata.parserUsed,
    templateMatched: metadata.templateMatched,
    similarityScore: metadata.similarityScore,
    confidenceScore: metadata.confidenceScore,
    confidenceDecision: metadata.confidenceDecision,
    claudeUsed: metadata.claudeUsed,
    processingTimeMs: metadata.processingTimeMs,
    validationRequired: metadata.validationRequired,
  };
}


// ============================================================
// MULTER CONFIGURATION
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (
    _req,
    file,
    cb
  ) => {
    const isPdf =
      file.mimetype ===
        "application/pdf" ||
      file.originalname
        .toLowerCase()
        .endsWith(".pdf");

    if (isPdf) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only PDF files are allowed"
        )
      );
    }
  },
});


// ============================================================
// ADIE ITEM → APPLICATION ITEM MAPPER
// ============================================================

/**
 * Converts ADIE's learned item structure into the ParsedItem
 * structure expected by the existing stock upload pipeline.
 *
 * `stock` remains an ADIE compatibility field and is therefore
 * not persisted separately here.
 *
 * `photoRef` is not the same as imageData. Actual image mapping
 * will be integrated separately.
 */
function mapLearnedItemToParsedItem(
  item: LearnedTileItem
): ParsedItem | null {
  const tileName =
    item.itemName?.trim();

  if (!tileName) {
    return null;
  }

  /*
   * ADIE should normally provide boxCount / pcsCount.
   *
   * For compatibility with older learned templates, if both
   * quantities are missing but legacy stock exists, use stock
   * as boxCount.
   */
  let boxCount =
    item.boxCount ?? null;

  let pcsCount =
    item.pcsCount ?? null;

  if (
    boxCount === null &&
    pcsCount === null &&
    item.stock !== null
  ) {
    boxCount = item.stock;
  }

  return {
    tileName,

    brand:
      item.brand?.trim() ||
      null,

    size:
      item.size?.trim() ||
      null,

    finish:
      item.finish?.trim() ||
      null,

    boxCount,
    pcsCount,

    /*
     * ADIE photoRef currently identifies an extracted image,
     * but it is not imageData itself.
     *
     * Keep this null until the image-association component
     * maps PDF images to products.
     */
    imageData: null,

    /*
     * Location is not currently learned by the ADIE template.
     */
    location: null,
  };
}


// ============================================================
// ADIE ITEM ARRAY → PARSED ITEM ARRAY
// ============================================================

function mapLearnedItems(
  items: LearnedTileItem[]
): ParsedItem[] {
  const mapped: ParsedItem[] = [];

  for (const item of items) {
    const parsed =
      mapLearnedItemToParsedItem(
        item
      );

    if (parsed) {
      mapped.push(parsed);
    }
  }

  return mapped;
}

function parseDepotId(
  value: unknown
): number | null {
  const depotId =
    parseInt(
      value as string,
      10
    );

  return Number.isNaN(
    depotId
  )
    ? null
    : depotId;
}

async function persistParsedStockItems(
  items: ParsedItem[],
  depotId: number,
  uploadId: number,
  stockDate: string | null,
  tx?: {
    insert: typeof db.insert;
    delete: typeof db.delete;
  }
): Promise<void> {
  const toInsert = items.map(
    (item) => ({
      depotId,
      uploadId,
      tileName: item.tileName,
      brand: item.brand,
      size: item.size,
      finish: item.finish,
      boxCount:
        item.boxCount !== null
          ? String(item.boxCount)
          : null,
      pcsCount:
        item.pcsCount !== null
          ? String(item.pcsCount)
          : null,
      stockDate,
      imageData: item.imageData ?? null,
      location: item.location ?? null,
    })
  );

  for (
    let index = 0;
    index < toInsert.length;
    index += 100
  ) {
    const targetDb = tx ?? db;

    await targetDb
      .insert(stockItemsTable)
      .values(
        toInsert.slice(
          index,
          index + 100
        )
      );
  }
}

async function processUploadFile(
  uploadId: number,
  depotId: number,
  stockDate: string | null,
  fileBuffer: Buffer,
  log: {
    error: (
      fields: Record<string, unknown>,
      message: string
    ) => void;
  }
): Promise<void> {
  const startedAt = Date.now();

  try {
    const items =
      await parsePdf(fileBuffer, uploadId);

    if (items.length === 0) {
      await db
        .update(uploadsTable)
        .set({
          status: "failed",
          errorMessage:
            "No stock items could be extracted from the PDF",
          completedAt: new Date(),
        })
        .where(eq(uploadsTable.id, uploadId));

      return;
    }

    /*
     * IMPORTANT:
     *
     * Parsing happens BEFORE deletion.
     *
     * Therefore if ADIE/Claude fails, the previous depot
     * stock is preserved.
     */

    // Transaction boundary: replace the depot stock atomically so the
    // delete-and-insert sequence is all-or-nothing.
    await db.transaction(async (tx) => {
      await tx
        .delete(stockItemsTable)
        .where(
          eq(stockItemsTable.depotId, depotId)
        );

      // If any insert fails here, the transaction rolls back and the
      // previous stock remains intact.
      await persistParsedStockItems(
        items,
        depotId,
        uploadId,
        stockDate,
        tx
      );
    });

    patchUploadProcessingMetadata(uploadId, {
      processingTimeMs: Date.now() - startedAt,
    });

    await db
      .update(uploadsTable)
      .set({
        status: "done",
        itemsExtracted: items.length,
        completedAt: new Date(),
      })
      .where(eq(uploadsTable.id, uploadId));

    console.log(
      `Upload ${uploadId} completed with ${items.length} items`
    );
  } catch (err) {
    log.error(
      { err },
      "PDF processing failed"
    );

    patchUploadProcessingMetadata(uploadId, {
      processingTimeMs: Date.now() - startedAt,
    });

    await db
      .update(uploadsTable)
      .set({
        status: "failed",
        errorMessage:
          err instanceof Error
            ? err.message
            : "Processing failed",
        completedAt: new Date(),
      })
      .where(eq(uploadsTable.id, uploadId));
  }
}

// ============================================================
// MAIN PDF PARSER
// ============================================================

async function parsePdf(
  pdfBuffer: Buffer,
  uploadId: number
): Promise<ParsedItem[]> {
  const {
    rawText,
    images,
    pageImages,
  } = await extractPdf(
    pdfBuffer
  );

  logRawTextPreview(
    rawText
  );

  if (!rawText.trim()) {
    return parseImageOnlyPdf(
      pageImages,
      images,
      uploadId
    );
  }

  const document =
    await buildAdieDocument(
      rawText,
      images,
      pageImages.length
    );

  if (!document) {
    return parseUsingLegacyPipeline(
      rawText,
      images,
      pageImages.length,
      uploadId
    );
  }

  const templateMatch =
    await matchTemplate(
      document,
      rawText,
      images,
      pageImages.length,
      uploadId
    );

  if (!templateMatch) {
    return parseUsingLegacyPipeline(
      rawText,
      images,
      pageImages.length,
      uploadId
    );
  }

  const knownTemplateResult =
    await tryKnownTemplateExtraction(
      document,
      templateMatch,
      uploadId
    );

  if (knownTemplateResult) {
    return knownTemplateResult;
  }

  const oldLocalResult =
    await tryExistingLocalParser(
      rawText,
      images,
      pageImages.length,
      uploadId
    );

  if (oldLocalResult) {
    return oldLocalResult;
  }

  if (!templateMatch.found) {
    const learnedResult =
      await tryLearningTemplate(
        rawText,
        document,
        uploadId
      );

    if (learnedResult) {
      return learnedResult;
    }
  }

  console.log(
    "ADIE: Falling back to existing Claude parser"
  );

  return parseViaClaude(
    rawText,
    images
  );
}

function logRawTextPreview(
  rawText: string
): void {
  console.log(
    "RAW TEXT LENGTH:",
    rawText.length
  );

  if (rawText.length === 0) {
    return;
  }

  console.log(
    "RAW TEXT PREVIEW:"
  );

  console.log(
    rawText.substring(
      0,
      1000
    )
  );
}

async function parseImageOnlyPdf(
  pageImages: {
    b64: string;
    y: number;
    page: number;
  }[],
  images: {
    b64: string;
    y: number;
    page: number;
  }[],
  uploadId: number
): Promise<ParsedItem[]> {
  console.log(
    "ADIE: No text layer detected - using Claude Vision"
  );

  if (pageImages.length === 0) {
    console.log(
      "ADIE: No rendered page images available"
    );

    return [];
  }

  patchUploadProcessingMetadata(uploadId, {
    parserUsed: "vision",
    claudeUsed: false,
  });

  return parseViaVision(
    pageImages,
    images
  );
}

async function buildAdieDocument(
  rawText: string,
  images: {
    b64: string;
    y: number;
    page: number;
  }[],
  pageCount: number
): Promise<ReturnType<typeof documentBuilder.build> | null> {
  try {
    return documentBuilder.build(
      rawText
    );
  } catch (error) {
    console.error(
      "ADIE: Document model build failed:",
      error
    );

    return null;
  }
}

async function matchTemplate(
  document: ReturnType<
    typeof documentBuilder.build
  >,
  rawText: string,
  images: {
    b64: string;
    y: number;
    page: number;
  }[],
  pageCount: number,
  uploadId: number
): Promise<
  | ReturnType<
      typeof templateMatcher.match
    >
  | null
> {
  try {
    const templateMatch =
      templateMatcher.match(
        document
      );

    console.log(
      "ADIE fingerprint:",
      templateMatch.fingerprint
    );

    console.log(
      "ADIE template known:",
      templateMatch.found
    );

    patchUploadProcessingMetadata(uploadId, {
      templateMatched: templateMatch.template?.fingerprint ?? null,
      validationRequired: templateMatch.validationRequired ?? null,
      claudeUsed: false,
    });

    return templateMatch;
  } catch (error) {
    console.error(
      "ADIE: Template matching failed:",
      error
    );

    return null;
  }
}

async function tryKnownTemplateExtraction(
  document: ReturnType<
    typeof documentBuilder.build
  >,
  templateMatch: ReturnType<
    typeof templateMatcher.match
  >,
  uploadId: number
): Promise<ParsedItem[] | null> {
  if (
    !templateMatch.found ||
    !templateMatch.template
  ) {
    return null;
  }

  console.log(
    "ADIE: Known template found:",
    templateMatch.template.id
  );

  console.log(
    "ADIE: Claude learning will NOT be called"
  );

  try {
    const template =
      JSON.parse(
        templateMatch.template
          .templateJson
      );

    const extraction =
      learnedTemplateExtractor.extract(
        document,
        template
      );

    console.log(
      "ADIE local confidence:",
      extraction.confidence
    );

    console.log(
      "ADIE local items:",
      extraction.items.length
    );

    if (extraction.warnings.length > 0) {
      console.warn(
        "ADIE local warnings:",
        extraction.warnings
      );
    }

    if (
      extraction.items.length > 0 &&
      extraction.confidence >= 80
    ) {
      const mapped =
        mapLearnedItems(
          extraction.items
        );

      if (mapped.length > 0) {
        console.log(
          "ADIE: Using learned local extractor"
        );

        patchUploadProcessingMetadata(uploadId, {
          parserUsed: "learned-template-extractor",
          confidenceScore: extraction.confidence,
          confidenceDecision: "LOCAL",
          claudeUsed: false,
        });

        console.log(
          "ADIE: Claude API call avoided"
        );

        return mapped;
      }
    }

    console.warn(
      "ADIE: Known template extraction was not reliable enough."
    );

    console.warn(
      "ADIE: Continuing to compatibility parsers."
    );
  } catch (error) {
    console.error(
      "ADIE: Known-template extraction failed:",
      error
    );
  }

  return null;
}

async function tryLearningTemplate(
  rawText: string,
  document: ReturnType<
    typeof documentBuilder.build
  >,
  uploadId: number
): Promise<ParsedItem[] | null> {
  console.log(
    "ADIE: Unknown template - starting Claude learning"
  );

  try {
    const learning =
      await learningCoordinator.process(
        rawText,
        document
      );

    console.log(
      "ADIE learning status:",
      learning.status
    );

    if (
      learning.status ===
        "learned" &&
      learning.learningResult
    ) {
      console.log(
        "ADIE: Template learned successfully"
      );

      console.log(
        "ADIE learned confidence:",
        learning.learningResult
          .confidence
      );

      console.log(
        "ADIE learned items:",
        learning.learningResult
          .items.length
      );

      if (
        learning.learningResult
          .warnings.length > 0
      ) {
        console.warn(
          "ADIE learning warnings:",
          learning.learningResult
            .warnings
        );
      }

      if (
        learning.learningResult
          .items.length > 0 &&
        learning.learningResult
          .confidence >= 70
      ) {
        const mapped =
          mapLearnedItems(
            learning.learningResult
              .items
          );

        if (mapped.length > 0) {
          console.log(
            "ADIE: Using items extracted during learning"
          );

          return mapped;
        }
      }

      console.warn(
        "ADIE: Learning completed but extraction result was not reliable enough."
      );
    }
  } catch (error) {
    console.error(
      "ADIE learning failed:",
      error
    );
  }

  return null;
}


// ============================================================
// EXISTING LOCAL PARSER HELPER
// ============================================================

async function tryExistingLocalParser(
  rawText: string,
  images: {
    b64: string;
    y: number;
    page: number;
  }[],
  pageCount: number,
  uploadId: number
): Promise<ParsedItem[] | null> {
  try {
    const oldMatch =
      detectDocument(
        rawText,
        pageCount
      );

    if (!oldMatch) {
      return null;
    }

    const result =
      await oldMatch.parser.parse(
        rawText,
        images
      );

    if (
      result.confidence >= 90 &&
      result.items.length > 0
    ) {
      patchUploadProcessingMetadata(uploadId, {
        parserUsed: oldMatch.parser.name,
        claudeUsed: false,
      });

      console.log(
        `Using existing local parser: ${oldMatch.parser.name}`
      );

      return result.items;
    }

    console.log(
      `Existing local parser ${oldMatch.parser.name} returned confidence ${result.confidence}`
    );

    return null;
  } catch (error) {
    console.error(
      "Existing local parser failed:",
      error
    );

    return null;
  }
}


// ============================================================
// LEGACY PIPELINE
// ============================================================
//
// Used only when ADIE cannot even build or match its neutral
// document model.
// ============================================================

async function parseUsingLegacyPipeline(
  rawText: string,
  images: {
    b64: string;
    y: number;
    page: number;
  }[],
  pageCount: number,
  uploadId: number
): Promise<ParsedItem[]> {
  const localResult =
    await tryExistingLocalParser(
      rawText,
      images,
      pageCount,
      uploadId
    );

  if (localResult) {
    return localResult;
  }

  console.log(
    "Using existing Claude parser because ADIE pipeline is unavailable"
  );

  return parseViaClaude(
    rawText,
    images
  );
}


// ============================================================
// GET /api/uploads
// ============================================================

router.get(
  "/",
  async (
    req: UploadRouteRequest & any,
    res
  ) => {
    try {
      const depotId =
        req.query.depotId
          ? parseInt(
              req.query
                .depotId as string,
              10
            )
          : null;

      const limit =
        Math.min(
          100,
          parseInt(
            (req.query
              .limit as string) ||
              "20",
            10
          )
        );

      const rows =
        await db
          .select({
            id:
              uploadsTable.id,

            depotId:
              uploadsTable.depotId,

            depotName:
              depotsTable.name,

            filename:
              uploadsTable.filename,

            status:
              uploadsTable.status,

            itemsExtracted:
              uploadsTable.itemsExtracted,

            errorMessage:
              uploadsTable.errorMessage,

            stockDate:
              uploadsTable.stockDate,

            createdAt:
              uploadsTable.createdAt,

            completedAt:
              uploadsTable.completedAt,
          })
          .from(
            uploadsTable
          )
          .innerJoin(
            depotsTable,
            eq(
              depotsTable.id,
              uploadsTable.depotId
            )
          )
          .where(
            depotId &&
            !isNaN(depotId)
              ? eq(
                  uploadsTable.depotId,
                  depotId
                )
              : undefined
          )
          .orderBy(
            desc(
              uploadsTable.createdAt
            )
          )
          .limit(limit);

      return res.json(
        rows.map((row) => ({
          ...row,
          ...serializeUploadProcessingMetadata(row.id),
        }))
      );
    } catch (err) {
      req.log.error(
        { err },
        "Failed to list uploads"
      );

      return res
        .status(500)
        .json({
          error:
            "Internal server error",
        });
    }
  }
);


// ============================================================
// POST /api/uploads
// ============================================================

router.post(
  "/",

  requireAdmin,

  upload.single("file"),

  async (
    req: UploadRouteRequest & any,
    res
  ) => {
    if (!req.file) {
      return res
        .status(400)
        .json({
          error:
            "PDF file is required",
        });
    }


    // --------------------------------------------------------
    // DEPOT
    // --------------------------------------------------------

    const depotId =
      parseDepotId(
        req.body.depotId
      );

    if (depotId === null) {
      return res
        .status(400)
        .json({
          error:
            "depotId is required",
        });
    }


    // --------------------------------------------------------
    // STOCK DATE
    // --------------------------------------------------------

    const stockDate:
      string | null =
        req.body.stockDate ||
        null;


    // --------------------------------------------------------
    // VALIDATE DEPOT
    // --------------------------------------------------------

    const [depot] =
      await db
        .select()
        .from(
          depotsTable
        )
        .where(
          eq(
            depotsTable.id,
            depotId
          )
        );

    if (!depot) {
      return res
        .status(400)
        .json({
          error:
            "Depot not found",
        });
    }


    // --------------------------------------------------------
    // CREATE UPLOAD RECORD
    // --------------------------------------------------------

    const [uploadRecord] =
      await db
        .insert(
          uploadsTable
        )
        .values({
          depotId,

          filename:
            req.file.originalname,

          status:
            "processing",

          stockDate,
        })
        .returning();


    // Respond immediately.
    res.status(201).json({
      ...uploadRecord,
      depotName:
        depot.name,
      ...serializeUploadProcessingMetadata(uploadRecord.id),
    });


    // --------------------------------------------------------
    // BACKGROUND PROCESSING
    // --------------------------------------------------------

    const fileBuffer =
      req.file.buffer;

    const uploadId =
      uploadRecord.id;

    const log =
      req.log;


    void processUploadFile(
      uploadId,
      depotId,
      stockDate,
      fileBuffer,
      log
    );


    return;
  }
);


// ============================================================
// GET /api/uploads/:id
// ============================================================

router.get(
  "/:id",
  async (
    req: UploadRouteRequest & any,
    res
  ) => {
    try {
      const rawId =
        req.params.id;

      /*
       * Express typings can represent route parameters as
       * string | string[]. Normalise before parseInt.
       */
      const idText =
        Array.isArray(rawId)
          ? rawId[0]
          : rawId;

      const id =
        parseInt(
          idText,
          10
        );

      if (isNaN(id)) {
        return res
          .status(400)
          .json({
            error:
              "Invalid id",
          });
      }

      const [row] =
        await db
          .select({
            id:
              uploadsTable.id,

            depotId:
              uploadsTable.depotId,

            depotName:
              depotsTable.name,

            filename:
              uploadsTable.filename,

            status:
              uploadsTable.status,

            itemsExtracted:
              uploadsTable.itemsExtracted,

            errorMessage:
              uploadsTable.errorMessage,

            stockDate:
              uploadsTable.stockDate,

            createdAt:
              uploadsTable.createdAt,

            completedAt:
              uploadsTable.completedAt,
          })
          .from(
            uploadsTable
          )
          .innerJoin(
            depotsTable,
            eq(
              depotsTable.id,
              uploadsTable.depotId
            )
          )
          .where(
            eq(
              uploadsTable.id,
              id
            )
          );

      if (!row) {
        return res
          .status(404)
          .json({
            error:
              "Upload not found",
          });
      }

      return res.json({
        ...row,
        ...serializeUploadProcessingMetadata(row.id),
      });
    } catch (err) {
      req.log.error(
        { err },
        "Failed to get upload"
      );

      return res
        .status(500)
        .json({
          error:
            "Internal server error",
        });
    }
  }
);


export default router;