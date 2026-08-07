import type { DocumentModel } from "../models/documentModel.js";
import type {
  LearnedTemplateDefinition,
  FieldRule,
} from "../models/learnedTemplate.js";
import type { LearnedTileItem } from "../models/learningResult.js";

export interface LocalExtractionResult {
  items: LearnedTileItem[];
  confidence: number;
  warnings: string[];
}

interface SectionContext {
  brand: string | null;
  finish: string | null;
  size: string | null;
  dispatchDate: string | null;
  piecesPerBox: number | null;
}

export class LearnedTemplateExtractor {
  extract(
    document: DocumentModel,
    template: LearnedTemplateDefinition
  ): LocalExtractionResult {
    const warnings: string[] = [];

    /*
     * First try the normal table-based extractor.
     */
    const tableResult = this.extractFromTables(
      document,
      template
    );

    if (tableResult.items.length > 0) {
      return tableResult;
    }

    /*
     * Complex supplier PDFs often lose their real table
     * structure during text extraction.
     */
    const blockResult = this.extractFromBlocks(
      document,
      template
    );

    if (blockResult.items.length === 0) {
      warnings.push(
        "Template matched, but no valid stock rows were extracted."
      );

      return {
        items: [],
        confidence: 0,
        warnings,
      };
    }

    return blockResult;
  }

  // ============================================================
  // TABLE EXTRACTION
  // ============================================================

  private extractFromTables(
    document: DocumentModel,
    template: LearnedTemplateDefinition
  ): LocalExtractionResult {
    const items: LearnedTileItem[] = [];

    for (const table of document.tables ?? []) {
      for (const row of table.rows ?? []) {
        const item = this.emptyItem();

        for (const rule of template.fields) {
          this.applyRule(
            item,
            row.values,
            rule,
            document
          );
        }

        this.applyTableStockDefinition(
          item,
          row.values,
          template
        );

        if (
          item.itemName &&
          item.stock !== null
        ) {
          item.itemName =
            this.cleanItemName(
              item.itemName
            );

          items.push(item);
        }
      }
    }

    return {
      items,
      confidence:
        items.length > 0 ? 95 : 0,
      warnings: [],
    };
  }

  // ============================================================
  // BLOCK / SECTION EXTRACTION
  // ============================================================

  private extractFromBlocks(
    document: DocumentModel,
    template: LearnedTemplateDefinition
  ): LocalExtractionResult {
    const items: LearnedTileItem[] = [];
    const warnings: string[] = [];

    const context: SectionContext = {
      brand: null,
      finish: null,
      size: null,
      dispatchDate: null,
      piecesPerBox: null,
    };

    const lines = (document.blocks ?? [])
      .map((block) => this.normalizeWhitespace(block.text))
      .filter(Boolean);

    for (let index = 0; index < lines.length; index++) {
      const consumed = this.processBlockLine(
        index,
        lines,
        context,
        template,
        items
      );

      if (consumed !== null) {
        index += consumed;
      }
    }

    const deduplicated =
      this.deduplicateItems(items);

    let confidence =
      deduplicated.length > 0 ? 85 : 0;

    if (deduplicated.length > 0) {
      const incomplete =
        deduplicated.filter(
          (item) =>
            !item.itemName ||
            item.stock === null
        ).length;

      if (incomplete > 0) {
        confidence -= 10;
      }
    }

    if (deduplicated.length === 0) {
      warnings.push(
        "Template matched, but no valid stock rows were extracted."
      );
    }

    return {
      items: deduplicated,
      confidence,
      warnings,
    };
  }

  private processBlockLine(
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    const line = lines[index];

    if (!line) {
      return null;
    }

    const nextLine =
      index + 1 < lines.length
        ? lines[index + 1]
        : null;

    const afterNextLine =
      index + 2 < lines.length
        ? lines[index + 2]
        : null;

    const handlers = [
      this.tryExtractDescriptionDispatchStock,
      this.tryExtractBrokenDispatchProduct,
      this.tryExtractProductDescriptionAndStockNextLine,
      this.tryExtractNormalCompleteProductRow,
      this.tryExtractStandaloneDispatchDate,
      this.tryExtractSectionHeading,
      this.tryExtractFinishHeading,
      this.tryExtractBrandHeading,
      this.tryExtractStructuralLine,
      this.tryExtractFinalFallback,
    ];

    for (const handler of handlers) {
      const consumed = handler.call(
        this,
        line,
        nextLine,
        afterNextLine,
        index,
        lines,
        context,
        template,
        items
      );

      if (consumed !== null) {
        return consumed;
      }
    }

    return null;
  }

  private tryExtractDescriptionDispatchStock(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (
      !nextLine ||
      !afterNextLine ||
      !/\b(?:DESPATCH|DISPATCH)\b/i.test(nextLine) ||
      !this.looksLikeProductName(line) ||
      this.isStructuralLine(line) ||
      this.isDispatchDateLine(line)
    ) {
      return null;
    }

    const stockPart = nextLine.match(
      /^(.*?)\s*\(?\s*(?:DESPATCH|DISPATCH)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)\s*$/i
    );

    if (!stockPart) {
      return null;
    }

    const descriptionContinuation =
      this.normalizeWhitespace(stockPart[1] ?? "");

    const boxValue = stockPart[2];
    const pcsValue = stockPart[3];

    const reconstructedDescription =
      this.normalizeWhitespace(
        `${line} ${descriptionContinuation}`
      );

    const reconstructedRow =
      `${reconstructedDescription} ${boxValue} ${pcsValue}`;

    const parsed = this.parseProductLine(
      reconstructedRow,
      context,
      template
    );

    if (!parsed || !parsed.itemName || parsed.stock === null) {
      return null;
    }

    parsed.dispatchDate =
      this.extractDispatchDate(`${nextLine} ${afterNextLine}`) ??
      this.extractLooseDispatchDate(`${nextLine} ${afterNextLine}`);

    if (parsed.brand && this.isInvalidBrand(parsed.brand)) {
      parsed.brand = null;
    }

    this.finalizeParsedProduct(parsed, items, context);
    return 2;
  }

  private tryExtractBrokenDispatchProduct(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (
      !this.looksLikeBrokenDispatchProduct(line) ||
      !nextLine ||
      !this.looksLikeStockContinuation(nextLine)
    ) {
      return null;
    }

    const reconstructedDescription = line
      .replace(/\(?\s*(?:DESPATCH|DISPATCH)\s*$/i, "")
      .trim();

    const reconstructed = `${reconstructedDescription} ${nextLine}`;

    const parsed = this.parseProductLine(
      reconstructed,
      context,
      template
    );

    if (!parsed || !parsed.itemName || parsed.stock === null) {
      return null;
    }

    if (afterNextLine) {
      parsed.dispatchDate =
        this.extractDispatchDate(`${line} ${afterNextLine}`) ??
        this.extractLooseDispatchDate(`${line} ${afterNextLine}`);
    } else {
      parsed.dispatchDate = null;
    }

    if (parsed.brand && this.isInvalidBrand(parsed.brand)) {
      parsed.brand = null;
    }

    this.finalizeParsedProduct(parsed, items, context);

    const extraConsumed =
      afterNextLine && this.looksLikeDispatchContinuation(afterNextLine)
        ? 2
        : 1;

    return extraConsumed;
  }

  private tryExtractProductDescriptionAndStockNextLine(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (
      !nextLine ||
      !this.looksLikeStockContinuation(nextLine) ||
      !this.looksLikeProductName(line) ||
      this.isDispatchDateLine(line) ||
      this.isStructuralLine(line)
    ) {
      return null;
    }

    let description = line;
    let consumedAfterStock = false;

    if (afterNextLine) {
      const afterIsDescriptionContinuation =
        this.looksLikeDescriptionContinuation(
          line,
          afterNextLine
        );

      const hasUnclosedParenthesis =
        (line.match(/\(/g) ?? []).length >
        (line.match(/\)/g) ?? []).length;

      const looksLikeClosingFragment =
        hasUnclosedParenthesis &&
        afterNextLine.length <= 80 &&
        /\)/.test(afterNextLine) &&
        !this.looksLikeStockContinuation(afterNextLine) &&
        !this.isDispatchDateLine(afterNextLine);

      if (
        afterIsDescriptionContinuation ||
        looksLikeClosingFragment
      ) {
        description = `${description} ${afterNextLine}`;
        consumedAfterStock = true;
      }
    }

    const reconstructed = `${description} ${nextLine}`;

    const parsed = this.parseProductLine(
      reconstructed,
      context,
      template
    );

    if (!parsed || !parsed.itemName || parsed.stock === null) {
      return null;
    }

    const possibleDateLine =
      consumedAfterStock && index + 3 < lines.length
        ? lines[index + 3]
        : afterNextLine;

    const dateSearchText =
      `${line} ${afterNextLine ?? ""} ${possibleDateLine ?? ""}`;

    parsed.dispatchDate =
      this.extractDispatchDate(dateSearchText) ??
      this.extractLooseDispatchDate(dateSearchText);

    if (parsed.brand && this.isInvalidBrand(parsed.brand)) {
      parsed.brand = null;
    }

    this.finalizeParsedProduct(parsed, items, context);

    let consumedLines = 1;

    if (consumedAfterStock) {
      consumedLines += 1;
    }

    const dispatchDateLineIndex =
      index + consumedLines + 1;

    if (dispatchDateLineIndex < lines.length) {
      const possibleDispatchLine = lines[dispatchDateLineIndex];

      if (
        possibleDispatchLine &&
        this.isDispatchDateLine(possibleDispatchLine)
      ) {
        const date =
          this.extractDispatchDate(possibleDispatchLine) ??
          this.extractLooseDispatchDate(possibleDispatchLine);

        if (date) {
          parsed.dispatchDate = date;
          consumedLines += 1;
        }
      }
    }

    return consumedLines;
  }

  private tryExtractNormalCompleteProductRow(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (
      this.isStructuralLine(line) ||
      this.isDispatchDateLine(line)
    ) {
      return null;
    }

    const parsed = this.parseProductLine(
      line,
      context,
      template
    );

    if (!parsed || !parsed.itemName || parsed.stock === null) {
      return null;
    }

    const inlineDate =
      this.extractDispatchDate(line) ??
      this.extractLooseDispatchDate(line);

    parsed.dispatchDate = inlineDate ?? null;

    if (parsed.brand && this.isInvalidBrand(parsed.brand)) {
      parsed.brand = null;
    }

    this.finalizeParsedProduct(parsed, items, context);
    return 0;
  }

  private tryExtractStandaloneDispatchDate(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    const dispatchDate =
      this.extractDispatchDate(line) ??
      this.extractLooseDispatchDate(line);

    if (!dispatchDate || !this.isDispatchDateLine(line)) {
      return null;
    }

    if (items.length > 0) {
      const previous = items[items.length - 1];

      if (previous) {
        previous.dispatchDate = dispatchDate;
      }
    }

    context.dispatchDate = null;
    return 0;
  }

  private tryExtractSectionHeading(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    const detectedSize = this.extractSize(line);

    if (!detectedSize || !this.looksLikeSectionHeading(line)) {
      return null;
    }

    context.size = detectedSize;

    const finish = this.extractFinish(line);
    if (finish) {
      context.finish = finish;
    }

    const pcs = this.extractPiecesPerBox(line);
    if (pcs !== null) {
      context.piecesPerBox = pcs;
    }

    const brand = this.extractBrandFromHeading(line);
    if (brand && !this.isInvalidBrand(brand)) {
      context.brand = brand;
    }

    context.dispatchDate = null;
    return 0;
  }

  private tryExtractFinishHeading(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (!this.looksLikeFinishHeading(line)) {
      return null;
    }

    const finish = this.extractFinish(line);
    if (finish) {
      context.finish = finish;
    }

    const pcs = this.extractPiecesPerBox(line);
    if (pcs !== null) {
      context.piecesPerBox = pcs;
    }

    return 0;
  }

  private tryExtractBrandHeading(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (!this.looksLikeBrandHeading(line)) {
      return null;
    }

    const brand = this.extractBrandFromHeading(line);
    if (brand && !this.isInvalidBrand(brand)) {
      context.brand = brand;
    }

    const pcs = this.extractPiecesPerBox(line);
    if (pcs !== null) {
      context.piecesPerBox = pcs;
    }

    const finish = this.extractFinish(line);
    if (finish) {
      context.finish = finish;
    }

    const size = this.extractSize(line);
    if (size) {
      context.size = size;
    }

    context.dispatchDate = null;
    return 0;
  }

  private tryExtractStructuralLine(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (this.isStructuralLine(line)) {
      return 0;
    }

    return null;
  }

  private tryExtractFinalFallback(
    line: string,
    nextLine: string | null,
    afterNextLine: string | null,
    index: number,
    lines: string[],
    context: SectionContext,
    template: LearnedTemplateDefinition,
    items: LearnedTileItem[]
  ): number | null {
    if (
      !nextLine ||
      !this.looksLikeStockContinuation(nextLine) ||
      !this.looksLikeProductName(line)
    ) {
      return null;
    }

    const parsed = this.parseProductLine(
      `${line} ${nextLine}`,
      context,
      template
    );

    if (!parsed || !parsed.itemName || parsed.stock === null) {
      return null;
    }

    parsed.itemName = this.cleanItemName(parsed.itemName);
    parsed.dispatchDate = null;

    if (parsed.brand && this.isInvalidBrand(parsed.brand)) {
      parsed.brand = null;
    }

    this.finalizeParsedProduct(parsed, items, context);
    return 1;
  }

  private finalizeParsedProduct(
    parsed: LearnedTileItem,
    items: LearnedTileItem[],
    context: SectionContext
  ): boolean {
    if (!parsed.itemName || parsed.stock === null) {
      return false;
    }

    parsed.itemName = this.cleanItemName(parsed.itemName);

    if (parsed.brand && this.isInvalidBrand(parsed.brand)) {
      parsed.brand = null;
    }

    items.push(parsed);
    context.dispatchDate = null;
    return true;
  }

  // ============================================================
  // PRODUCT PARSING
  // ============================================================

  private parseProductLine(
    originalLine: string,
    context: SectionContext,
    template: LearnedTemplateDefinition
  ): LearnedTileItem | null {
    let line =
      this.normalizeWhitespace(
        originalLine
      );

    if (!line) {
      return null;
    }

    /*
     * Remove complete dispatch-date fragments.
     */
    line = line.replace(
      /\(?\s*(?:DESPATCH|DISPATCH)\s+DATE\s*[:=-]?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*\)?/gi,
      " "
    );

    line =
      this.normalizeWhitespace(
        line
      );

    /*
     * Require stock numbers at the end.
     *
     * Examples:
     *
     * PRODUCT NAME 218 0
     * PRODUCT NAME 218
     */

    const stockMatch =
      line.match(
        /^(.*?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)\s*$/
      ) ??
      line.match(
        /^(.*?)\s+(-?\d[\d,]*(?:\.\d+)?)\s*$/
      );

    if (!stockMatch) {
      return null;
    }

    let description =
      stockMatch[1]?.trim();

    if (!description) {
      return null;
    }

    /*
     * Prevent headings/dates becoming products.
     */
    if (
      this.isStructuralLine(
        description
      )
    ) {
      return null;
    }

    const numbers =
      stockMatch
        .slice(2)
        .filter(
          (
            value
          ): value is string =>
            typeof value ===
            "string"
        );

    if (
      numbers.length === 0
    ) {
      return null;
    }

    const stockValues =
      numbers.map(
        (value) =>
          this.parseNumber(
            value
          )
      );

    if (
      stockValues[0] === null
    ) {
      return null;
    }

    let boxCount:
      number | null = null;

    let pcsCount:
      number | null = null;

    let stock:
      number | null = null;

    const stockUnit =
      template
        .stockDefinition
        ?.unit ??
      "unknown";

    switch (stockUnit) {
      case "both":
        boxCount =
          stockValues[0] ??
          null;

        pcsCount =
          stockValues[1] ??
          null;

        stock =
          boxCount;

        break;

      case "box":
        boxCount =
          stockValues[0] ??
          null;

        stock =
          boxCount;

        break;

      case "pcs":
        pcsCount =
          stockValues[0] ??
          null;

        stock =
          pcsCount;

        break;

      case "unknown":
      default:
        stock =
          stockValues[0] ??
          null;

        if (
          stockValues.length >= 2
        ) {
          boxCount =
            stockValues[0] ??
            null;

          pcsCount =
            stockValues[1] ??
            null;
        }

        break;
    }

    if (stock === null) {
      return null;
    }

    const inlineSize =
      this.extractSize(
        description
      );

    const inlineFinish =
      this.extractFinish(
        description
      );

    /*
     * Remove leading size because size is
     * stored separately.
     */
    description =
      description.replace(
        /^\s*(?:\d{1,4}\s*[Xx×]\s*\d{1,4})\s+/,
        ""
      );

    description =
      this.cleanItemName(
        description
      );

    if (
      !this.looksLikeProductName(
        description
      )
    ) {
      return null;
    }

    return {
      itemName:
        description,

      size:
        inlineSize ??
        context.size,

      finish:
        inlineFinish ??
        context.finish,

      stock,

      boxCount,

      pcsCount,

      piecesPerBox:
        template
          .stockDefinition
          ?.piecesPerBox ??
        context.piecesPerBox,

      brand:
        context.brand &&
        !this.isInvalidBrand(
          context.brand
        )
          ? context.brand
          : null,

      dispatchDate:
        context.dispatchDate,

      photoRef:
        null,
    };
  }

  // ============================================================
  // CONTEXT DETECTION
  // ============================================================

  private extractDispatchDate(
    text: string
  ): string | null {
    const match =
      text.match(
        /(?:DESPATCH|DISPATCH)\s+DATE\s*[:=-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i
      );

    return (
      match?.[1] ??
      null
    );
  }

  /*
   * Handles fragmented forms such as:
   *
   * DESPATCH ... DATE : 15-07-2026
   *
   * or:
   *
   * DATE : 15-07-2026)
   */
  private extractLooseDispatchDate(
    text: string
  ): string | null {
    const normalized =
      this.normalizeWhitespace(
        text
      );

    const direct =
      normalized.match(
        /(?:DESPATCH|DISPATCH)\s*(?:DATE)?\s*[:=-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i
      );

    if (direct?.[1]) {
      return direct[1];
    }

    const continuation =
      normalized.match(
        /\bDATE\s*[:=-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*\)?/i
      );

    return (
      continuation?.[1] ??
      null
    );
  }

  private isDispatchDateLine(
    text: string
  ): boolean {
    return (
      /(?:DESPATCH|DISPATCH)\s+DATE/i.test(
        text
      ) ||
      /^DATE\s*[:=-]?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*\)?$/i.test(
        text.trim()
      )
    );
  }

  private looksLikeDispatchContinuation(
    text: string
  ): boolean {
    const value =
      this.normalizeWhitespace(
        text
      );

    return /^DATE\s*[:=-]?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*\)?$/i.test(
      value
    );
  }

  private looksLikeBrokenDispatchProduct(
    text: string
  ): boolean {
    const value =
      this.normalizeWhitespace(
        text
      );

    if (
      !this.looksLikeProductName(
        value
      )
    ) {
      return false;
    }

    return /\(?\s*(?:DESPATCH|DISPATCH)\s*$/i.test(
      value
    );
  }

  private extractSize(
    text: string
  ): string | null {
    const match =
      text.match(
        /\b(\d{1,4})\s*[Xx×]\s*(\d{1,4})\b/
      );

    if (!match) {
      return null;
    }

    return `${match[1]}X${match[2]}`;
  }

  private extractFinish(
    text: string
  ): string | null {
    const upper =
      text.toUpperCase();

    /*
     * Order matters.
     */
    const finishes = [
      "HIGH GLOSSY",
      "SUPER GLOSSY",
      "CARVING",
      "POLISHED",
      "GLOSSY",
      "MATT",
      "MATTE",
      "SUGAR",
      "SATIN",
      "RUSTIC",
    ];

    for (
      const finish
      of finishes
    ) {
      if (
        upper.includes(
          finish
        )
      ) {
        return finish ===
          "MATTE"
          ? "MATT"
          : finish;
      }
    }

    return null;
  }

  private extractPiecesPerBox(
    text: string
  ): number | null {
    const match =
      text.match(
        /\(\s*(\d+)\s*PCS?\s*\)/i
      );

    if (!match) {
      return null;
    }

    const value =
      Number(
        match[1]
      );

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }

  private extractBrandFromHeading(
  text: string
): string | null {
  let value =
    this.normalizeWhitespace(text);

  if (
    !value ||
    this.isDispatchDateLine(value)
  ) {
    return null;
  }

  /*
   * Never derive a brand from a product row.
   *
   * Examples:
   *
   * 4X2 BEETHAS NEOMI GREY
   * 800X2400 SHREEM ELEGANT WHITE
   * 1600X800 SHREEM ENDLESS 005
   */
  if (
    /^\(?\s*\d{1,4}\s*[Xx×]\s*\d{1,4}\s*\)?\s+\S+/i.test(
      value
    )
  ) {
    return null;
  }

  /*
   * Remove pieces-per-box information.
   *
   * Examples:
   *
   * (1PCS)
   * (1 PCS)
   * (2 PCS)
   * 2 PCS
   */
  value = value.replace(
    /\(?\s*\d+\s*PCS?\s*\)?/gi,
    " "
  );

  /*
   * Remove size information.
   *
   * Examples:
   *
   * (1600X800)
   * 800X2400
   * (6X4)
   * (4X2)
   */
  value = value.replace(
    /\(?\s*\d{1,4}\s*[Xx×]\s*\d{1,4}\s*\)?/gi,
    " "
  );

  /*
   * Remove common finish / surface descriptors.
   *
   * Keep this generic rather than supplier-specific.
   */
  value = value.replace(
    /\b(?:SUPER\s+HIGH\s+GLOSSY|HIGH\s+GLOSSY|SUPER\s+GLOSSY|SUPER\s+HG|HIGH\s+GLOSS|GLOSSY|MATT|MATTE|CARVING|POLISHED|SUGAR|SATIN|RUSTIC|FULLBODY|FULL\s+BODY|COLOUR\s+BODY|COLOR\s+BODY|SOL\s+BODY)\b/gi,
    " "
  );

  /*
   * Remove generic section / collection words.
   *
   * Example:
   *
   * SHREEM ARTICO SERIES
   *
   * We do NOT remove ARTICO here automatically,
   * because it may be meaningful for another supplier.
   * SERIES itself is structural.
   */
  value = value.replace(
    /\b(?:SERIES|COLLECTION)\b/gi,
    " "
  );

  /*
   * Remove empty or separator-only parentheses.
   */
  value = value.replace(
    /\(\s*\)/g,
    " "
  );

  /*
   * Remove parentheses that contain only separators.
   */
  value = value.replace(
    /\(\s*[-/|,]*\s*\)/g,
    " "
  );

  /*
   * Clean remaining leading/trailing punctuation.
   */
  value = value.replace(
    /^[\s()\-–—:;,/|]+|[\s()\-–—:;,/|]+$/g,
    ""
  );

  value =
    this.normalizeWhitespace(value);

  if (
    !value ||
    !/[A-Za-z]/.test(value)
  ) {
    return null;
  }

  /*
   * Pure structural descriptors are not brands.
   */
  if (
    /^(?:SPECIAL|PLAIN|FULL\s*BODY|FULLBODY|SOL\s*BODY|COLOUR\s*BODY|COLOR\s*BODY|GLOSSY|HIGH\s*GLOSSY|SUPER\s*GLOSSY|MATT|MATTE|CARVING|POLISHED|SUGAR|SATIN|RUSTIC)$/i.test(
      value
    )
  ) {
    return null;
  }

  /*
   * Final existing safety validation.
   */
  if (
    this.isInvalidBrand(value)
  ) {
    return null;
  }

  /*
   * A heading containing too many words is probably
   * not a clean brand heading.
   */
  const words =
    value.split(/\s+/);

  if (
    words.length > 5
  ) {
    return null;
  }

  return value;
}

  private looksLikeSectionHeading(
    text: string
  ): boolean {
    if (
      !this.extractSize(
        text
      )
    ) {
      return false;
    }

    /*
     * If the line ends with stock-like numeric
     * columns, it is probably a product.
     */
    if (
      /\s+\d[\d,]*\s+\d[\d,]*\s*$/.test(
        text
      )
    ) {
      return false;
    }

    return true;
  }

  private looksLikeFinishHeading(
    text: string
  ): boolean {
    if (
      !this.extractFinish(
        text
      )
    ) {
      return false;
    }

    if (
      /\s+\d[\d,]*\s+\d[\d,]*\s*$/.test(
        text
      )
    ) {
      return false;
    }

    return (
      text.length <= 100 &&
      !this.looksLikeProductName(
        text
      )
    );
  }

  private looksLikeBrandHeading(
    text: string
  ): boolean {
    if (
      this.isDispatchDateLine(
        text
      )
    ) {
      return false;
    }

    if (
      /\s+\d[\d,]*\s+\d[\d,]*\s*$/.test(
        text
      )
    ) {
      return false;
    }

    /*
     * PCS information strongly suggests
     * section/brand heading.
     */
    if (
      /\(\s*\d+\s*PCS?\s*\)/i.test(
        text
      )
    ) {
      return true;
    }

    const upper =
      text.toUpperCase();

    if (
      upper.includes(
        "SERIES"
      ) ||
      upper.includes(
        "FULL BODY"
      ) ||
      upper.includes(
        "SOL BODY"
      )
    ) {
      return true;
    }

    return false;
  }

  // ============================================================
  // MULTILINE DESCRIPTION DETECTION
  // ============================================================

  private looksLikeDescriptionContinuation(
    previousLine: string,
    candidate: string
  ): boolean {
    const value =
      this.normalizeWhitespace(
        candidate
      );

    if (!value) {
      return false;
    }

    /*
     * A stock-only line cannot be description continuation.
     */
    if (
      this.looksLikeStockContinuation(
        value
      )
    ) {
      return false;
    }

    /*
     * Dates are not product-name continuation.
     */
    if (
      this.isDispatchDateLine(
        value
      )
    ) {
      return false;
    }

    /*
     * Structural headings are not continuation.
     */
    if (
      this.isStructuralLine(
        value
      )
    ) {
      return false;
    }

    /*
     * A new line beginning with a size is almost
     * certainly the next product.
     */
    if (
      this.extractSize(
        value
      )
    ) {
      return false;
    }

    /*
     * If candidate itself ends with stock columns,
     * it is another complete product.
     */
    if (
      /\s+-?\d[\d,]*(?:\.\d+)?\s+-?\d[\d,]*(?:\.\d+)?\s*$/.test(
        value
      )
    ) {
      return false;
    }

    const previous =
      previousLine.trim();

    /*
     * Unclosed parentheses strongly indicate the
     * description continues after the stock line.
     */
    const openParens =
      (
        previous.match(
          /\(/g
        ) ?? []
      ).length;

    const closeParens =
      (
        previous.match(
          /\)/g
        ) ?? []
      ).length;

    if (
      openParens >
      closeParens
    ) {
      return true;
    }

    /*
     * Common fragmented finish/series descriptions.
     */
    if (
      /(?:SEMI|HIGH|SUPER|RANDOM|T\.?|I\.?)\s*$/i.test(
        previous
      )
    ) {
      return true;
    }

    return false;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  private cleanItemName(
    input: string
  ): string {
    let value =
      this.normalizeWhitespace(
        input
      );

    /*
     * Remove complete dispatch date.
     */
    value =
      value.replace(
        /\(?\s*(?:DESPATCH|DISPATCH)\s+DATE\s*[:=-]?\s*\d{0,2}[-/.]?\d{0,2}[-/.]?\d{0,4}\s*\)?/gi,
        " "
      );

    /*
     * Remove dangling "(DESPATCH" fragments.
     */
    value =
      value.replace(
        /\(?\s*(?:DESPATCH|DISPATCH)\s*$/gi,
        " "
      );

    value =
      this.normalizeWhitespace(
        value
      );

    /*
     * Remove duplicated consecutive words caused
     * by broken PDF text layers.
     *
     * SHREEM SHREEM
     * CLOUDY CLOUDY
     * 5236 5236
     */
    const words =
      value.split(
        /\s+/
      );

    const cleaned:
      string[] = [];

    for (
      const word
      of words
    ) {
      const previous =
        cleaned[
          cleaned.length - 1
        ];

      if (
        previous &&
        previous.toUpperCase() ===
          word.toUpperCase()
      ) {
        continue;
      }

      cleaned.push(
        word
      );
    }

    value =
      cleaned.join(
        " "
      );

    /*
     * Remove duplicated leading size.
     */
    value =
      value.replace(
        /^(\d{1,4}X\d{1,4})\s+\1\s+/i,
        "$1 "
      );

    return this.normalizeWhitespace(
      value
    );
  }

  private isInvalidBrand(
    value: string
  ): boolean {
    const normalized =
      this.normalizeWhitespace(
        value
      );

    if (!normalized) {
      return true;
    }

    const upper =
      normalized.toUpperCase();

    if (
      upper.includes(
        "DESPATCH DATE"
      ) ||
      upper.includes(
        "DISPATCH DATE"
      ) ||
      /^DATE\s*:/i.test(
        normalized
      )
    ) {
      return true;
    }

    /*
     * Size-only text must never become a brand.
     *
     * Examples:
     *
     * 800X2400
     * (800X2400)
     * (800X2400) ( )
     */
    if (
      /^\(?\s*\d{1,4}\s*[Xx×]\s*\d{1,4}\s*\)?(?:\s*\(\s*\))*$/i.test(
        normalized
      )
    ) {
      return true;
    }

    /*
     * Product-looking size-prefixed text should
     * never become the section brand.
     */
    if (
      /^\d{1,4}\s*[Xx×]\s*\d{1,4}\s+\S+/i.test(
        normalized
      )
    ) {
      return true;
    }

    /*
     * Section descriptors are not brands.
     */
    if (
      /^\(?SPECIAL SERIES\)?$/i.test(
        normalized
      ) ||
      /^\(?PLAIN SERIES\)?$/i.test(
        normalized
      ) ||
      /^\(?FULL BODY\)?$/i.test(
        normalized
      ) ||
      /^\(?SOL BODY\)?$/i.test(
        normalized
      ) ||
      /^\(?CYCLONE\)?$/i.test(
        normalized
      )
    ) {
      return true;
    }

    return false;
  }

  private looksLikeProductName(
    text: string
  ): boolean {
    const value =
      text.trim();

    if (
      value.length < 2
    ) {
      return false;
    }

    if (
      !/[A-Za-z]/.test(
        value
      )
    ) {
      return false;
    }

    /*
     * A fragmented "(DESPATCH" product line is still
     * allowed here. Only reject a true standalone
     * dispatch date.
     */
    if (
      /^(?:DESPATCH|DISPATCH)\s+DATE/i.test(
        value
      ) ||
      /^DATE\s*[:=-]/i.test(
        value
      )
    ) {
      return false;
    }

    const upper =
      value.toUpperCase();

    const forbidden = [
      "STOCK REPORT",
      "STOCK LIST",
      "ITEM NAME",
      "DESCRIPTION",
      "TOTAL STOCK",
      "OPENING STOCK",
      "CLOSING STOCK",
      "BOX STOCK",
      "PCS STOCK",
    ];

    return !forbidden.some(
      (word) =>
        upper === word
    );
  }

  private isStructuralLine(
    text: string
  ): boolean {
    const upper =
      text
        .trim()
        .toUpperCase();

    if (!upper) {
      return true;
    }

    /*
     * Only treat real date lines as structural.
     * Do not reject a product ending in "(DESPATCH".
     */
    if (
      /^(?:DESPATCH|DISPATCH)\s+DATE/i.test(
        upper
      ) ||
      /^DATE\s*[:=-]?\s*\d/i.test(
        upper
      )
    ) {
      return true;
    }

    const structural = [
      "STOCK REPORT",
      "STOCK LIST",
      "ITEM",
      "ITEM NAME",
      "DESCRIPTION",
      "SIZE",
      "FINISH",
      "STOCK",
      "BOX",
      "BOXES",
      "PCS",
      "QTY",
      "QUANTITY",
      "RATE",
    ];

    if (
      structural.includes(
        upper
      )
    ) {
      return true;
    }

    /*
     * Common combined table header.
     */
    if (
      upper.includes(
        "ITEM NAME"
      ) &&
      upper.includes(
        "BOX"
      ) &&
      upper.includes(
        "PCS"
      )
    ) {
      return true;
    }

    return false;
  }

  private looksLikeStockContinuation(
    text: string
  ): boolean {
    return /^\s*-?\d[\d,]*(?:\.\d+)?(?:\s+-?\d[\d,]*(?:\.\d+)?)?\s*$/.test(
      text
    );
  }

  private deduplicateItems(
    items: LearnedTileItem[]
  ): LearnedTileItem[] {
    const result:
      LearnedTileItem[] = [];

    const seen =
      new Set<string>();

    for (
      const item
      of items
    ) {
      const key = [
        item.itemName ?? "",
        item.size ?? "",
        item.finish ?? "",
        item.stock ?? "",
        item.boxCount ?? "",
        item.pcsCount ?? "",
        item.piecesPerBox ?? "",
        item.dispatchDate ?? "",
      ]
        .join("|")
        .toUpperCase();

      if (
        seen.has(
          key
        )
      ) {
        continue;
      }

      seen.add(
        key
      );

      result.push(
        item
      );
    }

    return result;
  }

  // ============================================================
  // TABLE STOCK SEMANTICS
  // ============================================================

  private applyTableStockDefinition(
    item: LearnedTileItem,
    values: string[],
    template: LearnedTemplateDefinition
  ): void {
    const definition =
      template.stockDefinition;

    if (!definition) {
      return;
    }

    const readColumn = (
      index:
        number |
        undefined
    ): number | null => {
      if (
        index === undefined
      ) {
        return null;
      }

      const raw =
        values[index];

      if (
        raw === undefined ||
        raw === null
      ) {
        return null;
      }

      return this.parseNumber(
        String(raw)
      );
    };

    const boxCount =
      readColumn(
        definition.boxColumnIndex
      );

    const pcsCount =
      readColumn(
        definition.pcsColumnIndex
      );

    switch (
      definition.unit
    ) {
      case "box":
        item.boxCount =
          boxCount ??
          item.stock;

        item.pcsCount =
          null;

        if (
          item.boxCount !== null
        ) {
          item.stock =
            item.boxCount;
        }

        break;

      case "pcs":
        item.boxCount =
          null;

        item.pcsCount =
          pcsCount ??
          item.stock;

        if (
          item.pcsCount !== null
        ) {
          item.stock =
            item.pcsCount;
        }

        break;

      case "both":
        item.boxCount =
          boxCount;

        item.pcsCount =
          pcsCount;

        if (
          boxCount !== null
        ) {
          item.stock =
            boxCount;
        }

        break;

      case "unknown":
      default:
        break;
    }

    if (
      definition
        .piecesPerBox !==
      undefined
    ) {
      item.piecesPerBox =
        definition.piecesPerBox;
    }
  }

  // ============================================================
  // EXISTING TEMPLATE RULE SUPPORT
  // ============================================================

  private applyRule(
    item: LearnedTileItem,
    values: string[],
    rule: FieldRule,
    document: DocumentModel
  ): void {
    if (
      rule.source ===
        "column" &&
      rule.columnIndex !==
        undefined
    ) {
      const value =
        values[
          rule.columnIndex
        ]?.trim();

      if (!value) {
        return;
      }

      this.assignValue(
        item,
        rule.field,
        value
      );

      return;
    }

    if (
      rule.source ===
        "header" &&
      rule.label
    ) {
      const value =
        this.extractHeaderValue(
          document.layout.headers,
          rule.label
        );

      if (value) {
        this.assignValue(
          item,
          rule.field,
          value
        );
      }
    }
  }

  private extractHeaderValue(
    headers: string[],
    label: string
  ): string | null {
    const normalizedLabel =
      label.toLowerCase();

    for (
      const header
      of headers
    ) {
      const lower =
        header.toLowerCase();

      const index =
        lower.indexOf(
          normalizedLabel
        );

      if (
        index === -1
      ) {
        continue;
      }

      let value =
        header.slice(
          index +
            label.length
        );

      value =
        value
          .replace(
            /^[\s:=-]+/,
            ""
          )
          .trim();

      if (value) {
        return value;
      }
    }

    return null;
  }

  private assignValue(
    item: LearnedTileItem,
    field: FieldRule["field"],
    value: string
  ): void {
    switch (field) {
      case "itemName":
        item.itemName =
          this.cleanItemName(
            value
          );
        break;

      case "size":
        item.size =
          this.extractSize(
            value
          ) ??
          value;
        break;

      case "finish":
        item.finish =
          this.extractFinish(
            value
          ) ??
          value;
        break;

      case "brand":
        if (
          !this.isInvalidBrand(
            value
          )
        ) {
          item.brand =
            value;
        }
        break;

      case "dispatchDate":
        item.dispatchDate =
          this.extractDispatchDate(
            value
          ) ??
          this.extractLooseDispatchDate(
            value
          ) ??
          value;
        break;

      case "stock": {
        const stock =
          this.parseNumber(
            value
          );

        if (
          stock !== null
        ) {
          item.stock =
            stock;
        }

        break;
      }

      case "photo":
        /*
         * Image-to-product mapping is handled
         * elsewhere.
         */
        break;
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private emptyItem():
    LearnedTileItem {
    return {
      itemName: null,
      size: null,
      finish: null,
      stock: null,
      boxCount: null,
      pcsCount: null,
      piecesPerBox: null,
      brand: null,
      dispatchDate: null,
      photoRef: null,
    };
  }

  private parseNumber(
    value: string
  ): number | null {
    const normalized =
      value
        .replace(
          /,/g,
          ""
        )
        .trim();

    if (!normalized) {
      return null;
    }

    const number =
      Number(
        normalized
      );

    return Number.isFinite(
      number
    )
      ? number
      : null;
  }

  private normalizeWhitespace(
    value: string
  ): string {
    return value
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }
}

export default new LearnedTemplateExtractor();