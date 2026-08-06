import Anthropic from "@anthropic-ai/sdk";
import type { ParsedItem } from "../types/pdf";
import { extractJsonArray } from "../utils/jsonExtractor";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VISION_BATCH_SIZE = 8;    // pages per Claude Vision call (kept small to stay under token budget)
const MAX_VISION_RETRIES = 4;   // attempts per batch before giving up

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string };
};

function makeImageBlock(pi: { b64: string; mime: string }): ImageBlock {
  return {
    type: "image" as const,
    source: {
      type:       "base64" as const,
      media_type: (pi.mime === "image/jpeg" ? "image/jpeg" : "image/png") as "image/png" | "image/jpeg",
      data:       pi.b64,
    },
  };
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("overloaded_error") ||
    msg.includes("Overloaded") ||
    msg.includes("529") ||
    msg.includes("terminated") ||
    msg.includes("other side closed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket hang up") ||
    (typeof (err as Record<string,unknown>)?.status === "number" && (err as Record<string,unknown>).status === 529)
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call Claude Vision for one batch of page images, with retry on overload. */
async function visionBatchWithRetry(
  imageBlocks: ImageBlock[],
  promptText: string,
): Promise<Record<string, unknown>[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_VISION_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 15s, 30s, 60s
      await sleep(15_000 * Math.pow(2, attempt - 1));
    }
    try {
      let fullText = "";
      const stream = await anthropic.messages.stream({
        model:      "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{
          role:    "user",
          content: [...imageBlocks, { type: "text" as const, text: promptText }],
        }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullText += event.delta.text;
        }
      }
      const parsed = (extractJsonArray(fullText) ?? []) as Record<string, unknown>[];
      if (parsed.length === 0) {
        console.log(`[vision] WARNING: empty parse, response length=${fullText.length}, first 300: ${fullText.slice(0, 300)}`);
      }
      return parsed;
    } catch (err) {
      if (isRetryableError(err)) {
        lastErr = err;
        continue; // retry after backoff
      }
      throw err; // non-retryable — bubble up immediately
    }
  }
  throw lastErr ?? new Error("Claude Vision overloaded after retries");
}

export async function parseViaVision(
  pageImages: Array<{ b64: string; page: number; mime: string }>,
  tileImages: Array<{ b64: string; y: number; page: number }>
): Promise<ParsedItem[]> {
  // Build mutable tile-image queues keyed by actual page number
  const tileQueueByPage = new Map<number, string[]>();
  for (const img of tileImages) {
    const arr = tileQueueByPage.get(img.page) ?? [];
    arr.push(img.b64);
    tileQueueByPage.set(img.page, arr);
  }

  const allRaw: Record<string, unknown>[] = [];

  // Process pages in batches so each Claude call is small and retryable
  for (let batchStart = 0; batchStart < pageImages.length; batchStart += VISION_BATCH_SIZE) {
    const batch = pageImages.slice(batchStart, batchStart + VISION_BATCH_SIZE);
    const imageBlocks = batch.map(makeImageBlock);

    // Tell Claude whether the cover page (actual page 0) is in this batch
    const coverNote =
      batchStart === 0
        ? "The FIRST image in this batch is the catalog cover page — skip it, it contains no stock items."
        : "There is no cover page in this batch — all images are data pages.";

    const promptText = `You are a tile stock data extractor for an Indian tiles business.
The images are pages ${batchStart}–${batchStart + batch.length - 1} of a Kresto/Starko tile stock list PDF.
${coverNote}

Each data page shows a 3-column table:
  Column 1 (left)   — Item Name  (e.g. "KRESTO TANISHQE BEIGE")
  Column 2 (centre) — Qty        (e.g. "108 BOX" or "OUT OF STOCK")
  Column 3 (right)  — Picture    (tile photo — ignore)

Section header rows (coloured/shaded background, e.g. "1200x1800 GLOSSY SERIES",
"800x600 MATT SERIES", "600X600 GLOSSY SERIES") are NOT items.
Extract size (e.g. "1200X1800") and finish (e.g. "GLOSSY") from them and apply
to every item that follows until the next header.

Rules:
  • tileName  : Full text in the Item Name cell. Include size prefix if present (e.g. "600X1200 KRESTO ELITE BROWN").
  • brand     : Brand name in the item name (e.g. "KRESTO", "LAVIT", "ONE TOUCH") or null.
  • size      : From the section header above, or embedded in the item name if present.
  • finish    : From the section header (GLOSSY, MATT, etc.) or item name if stated.
  • boxCount  : "NNN BOX" → NNN (number); "OUT OF STOCK" → 0. Never null.
  • pcsCount  : null.
  • location  : null.
  • pageIndex : Index of the image in THIS batch that the item came from (0 = first image of this batch).

Output ONLY a raw JSON array. Each element on a SINGLE LINE. No markdown. No explanation.
Example (first batch, page 1 = index 1 in batch):
[{"tileName":"KRESTO TANISHQE BEIGE","brand":"KRESTO","size":"1200X1800","finish":"GLOSSY","boxCount":0,"pcsCount":null,"location":null,"pageIndex":1}]

Include ALL items. Skip cover, section headers, footers, emails, page numbers.`;

    // Small delay between batches to avoid rate-limiting
    if (batchStart > 0) await sleep(2_000);

    const batchItems = await visionBatchWithRetry(imageBlocks, promptText);
    console.log(`[vision] batch pages ${batchStart}–${batchStart + batch.length - 1}: ${batchItems.length} items`);

    // Translate local pageIndex → actual page number, then accumulate
    for (const item of batchItems) {
      const localIdx  = item.pageIndex != null ? Number(item.pageIndex) : null;
      const actualPage = localIdx != null ? batchStart + localIdx : null;
      allRaw.push({ ...item, _actualPage: actualPage });
    }
  }

  // Map raw items to ParsedItem, matching tile photos by actual page number
  return allRaw
    .map((item) => {
      const actualPage = item._actualPage != null ? Number(item._actualPage) : null;
      let imageData: string | null = null;
      if (actualPage !== null) {
        const queue = tileQueueByPage.get(actualPage);
        if (queue && queue.length > 0) imageData = queue.shift() ?? null;
      }
      return {
        tileName: String(item.tileName  ?? "").trim(),
        brand:    item.brand  ? String(item.brand).trim()  : null,
        size:     item.size   ? String(item.size).trim()   : null,
        finish:   item.finish ? String(item.finish).trim() : null,
        boxCount: item.boxCount != null ? Number(item.boxCount) : null,
        pcsCount: item.pcsCount != null ? Number(item.pcsCount) : null,
        imageData,
        location: null,
      };
    })
    .filter((item) => item.tileName.length > 0);
}