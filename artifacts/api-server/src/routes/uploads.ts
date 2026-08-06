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


// ============================================================
// MAIN PDF PARSER
// ============================================================

async function parsePdf(
  pdfBuffer: Buffer
): Promise<ParsedItem[]> {
  const {
    rawText,
    images,
    pageImages,
  } = await extractPdf(
    pdfBuffer
  );

  console.log(
    "RAW TEXT LENGTH:",
    rawText.length
  );

  // Do not print the complete PDF.
  // Keep only a short preview for debugging.
  if (rawText.length > 0) {
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


  // ==========================================================
  // IMAGE-ONLY PDF
  // ==========================================================

  if (!rawText.trim()) {
    console.log(
      "ADIE: No text layer detected - using Claude Vision"
    );

    if (
      pageImages.length === 0
    ) {
      console.log(
        "ADIE: No rendered page images available"
      );

      return [];
    }

    return parseViaVision(
      pageImages,
      images
    );
  }


  // ==========================================================
  // BUILD ADIE DOCUMENT MODEL
  // ==========================================================

  let document:
    ReturnType<
      typeof documentBuilder.build
    >;

  try {
    document =
      documentBuilder.build(
        rawText
      );
  } catch (error) {
    console.error(
      "ADIE: Document model build failed:",
      error
    );

    /*
     * Failure to build an ADIE model must not prevent
     * the older parsers from processing the upload.
     */
    return parseUsingLegacyPipeline(
      rawText,
      images,
      pageImages.length
    );
  }


  // ==========================================================
  // CHECK ADIE MEMORY
  // ==========================================================

  let templateMatch:
    ReturnType<
      typeof templateMatcher.match
    >;

  try {
    templateMatch =
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
  } catch (error) {
    console.error(
      "ADIE: Template matching failed:",
      error
    );

    return parseUsingLegacyPipeline(
      rawText,
      images,
      pageImages.length
    );
  }


  // ==========================================================
  // KNOWN ADIE TEMPLATE
  // ==========================================================

  if (
    templateMatch.found &&
    templateMatch.template
  ) {
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

      if (
        extraction.warnings.length >
        0
      ) {
        console.warn(
          "ADIE local warnings:",
          extraction.warnings
        );
      }

      /*
       * Use ADIE when:
       *
       * - it extracted items
       * - confidence is reasonably high
       *
       * 80 is intentionally slightly below the test result
       * of 85, while still protecting production from weak
       * local extraction.
       */
      if (
        extraction.items.length >
          0 &&
        extraction.confidence >=
          80
      ) {
        const mapped =
          mapLearnedItems(
            extraction.items
          );

        if (mapped.length > 0) {
          console.log(
            "ADIE: Using learned local extractor"
          );

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

      /*
       * Never fail the upload solely because the learned
       * extractor encountered a problem.
       */
    }
  }


  // ==========================================================
  // EXISTING LOCAL PARSER
  // ==========================================================
  //
  // Keep the old local parser as a compatibility layer.
  //
  // This is especially useful during migration while ADIE is
  // still learning more supplier layouts.
  // ==========================================================

  const oldLocalResult =
    await tryExistingLocalParser(
      rawText,
      images,
      pageImages.length
    );

  if (oldLocalResult) {
    return oldLocalResult;
  }


  // ==========================================================
  // UNKNOWN ADIE TEMPLATE
  // ==========================================================

  if (!templateMatch.found) {
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

        /*
         * The first unknown document has already been
         * extracted by Claude during the learning process.
         *
         * Therefore there is no reason to call the old Claude
         * parser again when this result is usable.
         */
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

      /*
       * ADIE failure must never stop an otherwise parseable
       * stock report.
       */
    }
  }


  // ==========================================================
  // FINAL CLAUDE FALLBACK
  // ==========================================================

  console.log(
    "ADIE: Falling back to existing Claude parser"
  );

  return parseViaClaude(
    rawText,
    images
  );
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
  pageCount: number
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
  pageCount: number
): Promise<ParsedItem[]> {
  const localResult =
    await tryExistingLocalParser(
      rawText,
      images,
      pageCount
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
    req,
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
        rows
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
    req,
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
      parseInt(
        req.body.depotId,
        10
      );

    if (isNaN(depotId)) {
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


    void (async () => {
      try {
        // ----------------------------------------------------
        // PARSE PDF
        // ----------------------------------------------------

        const items =
          await parsePdf(
            fileBuffer
          );


        // ----------------------------------------------------
        // EMPTY RESULT
        // ----------------------------------------------------

        if (
          items.length === 0
        ) {
          await db
            .update(
              uploadsTable
            )
            .set({
              status:
                "failed",

              errorMessage:
                "No stock items could be extracted from the PDF",

              completedAt:
                new Date(),
            })
            .where(
              eq(
                uploadsTable.id,
                uploadId
              )
            );

          return;
        }


        // ----------------------------------------------------
        // REMOVE PREVIOUS DEPOT STOCK
        // ----------------------------------------------------

        /*
         * IMPORTANT:
         *
         * Parsing happens BEFORE deletion.
         *
         * Therefore if ADIE/Claude fails, the previous depot
         * stock is preserved.
         */

        await db
          .delete(
            stockItemsTable
          )
          .where(
            eq(
              stockItemsTable.depotId,
              depotId
            )
          );


        // ----------------------------------------------------
        // MAP DATABASE ROWS
        // ----------------------------------------------------

        const toInsert =
          items.map(
            (item) => ({
              depotId,

              uploadId,

              tileName:
                item.tileName,

              brand:
                item.brand,

              size:
                item.size,

              finish:
                item.finish,

              boxCount:
                item.boxCount !==
                null
                  ? String(
                      item.boxCount
                    )
                  : null,

              pcsCount:
                item.pcsCount !==
                null
                  ? String(
                      item.pcsCount
                    )
                  : null,

              stockDate,

              imageData:
                item.imageData ??
                null,

              location:
                item.location ??
                null,
            })
          );


        // ----------------------------------------------------
        // INSERT IN BATCHES
        // ----------------------------------------------------

        for (
          let i = 0;
          i < toInsert.length;
          i += 100
        ) {
          await db
            .insert(
              stockItemsTable
            )
            .values(
              toInsert.slice(
                i,
                i + 100
              )
            );
        }


        // ----------------------------------------------------
        // MARK UPLOAD COMPLETE
        // ----------------------------------------------------

        await db
          .update(
            uploadsTable
          )
          .set({
            status:
              "done",

            itemsExtracted:
              items.length,

            completedAt:
              new Date(),
          })
          .where(
            eq(
              uploadsTable.id,
              uploadId
            )
          );


        console.log(
          `Upload ${uploadId} completed with ${items.length} items`
        );
      } catch (err) {
        log.error(
          { err },
          "PDF processing failed"
        );

        await db
          .update(
            uploadsTable
          )
          .set({
            status:
              "failed",

            errorMessage:
              err instanceof Error
                ? err.message
                : "Processing failed",

            completedAt:
              new Date(),
          })
          .where(
            eq(
              uploadsTable.id,
              uploadId
            )
          );
      }
    })();


    return;
  }
);


// ============================================================
// GET /api/uploads/:id
// ============================================================

router.get(
  "/:id",
  async (
    req,
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

      return res.json(
        row
      );
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