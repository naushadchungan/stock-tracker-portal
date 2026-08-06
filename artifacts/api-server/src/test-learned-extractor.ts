import documentBuilder from "./templateEngine/builders/documentBuilder.js";
import learnedTemplateExtractor from "./templateEngine/extractors/learnedTemplateExtractor.js";
import type { LearnedTemplateDefinition } from "./templateEngine/models/learnedTemplate.js";

const template: LearnedTemplateDefinition = {
  schemaVersion: 1,

  documentType: "tile_stock_report",

  fields: [
    {
      field: "itemName",
      source: "column",
      columnIndex: 0,
      required: true,
    },

    {
      field: "size",
      source: "column",
      columnIndex: 1,
      required: false,
    },

    {
      field: "finish",
      source: "column",
      columnIndex: 2,
      required: false,
    },

    {
      field: "stock",
      source: "column",
      columnIndex: 3,
      required: true,
    },

    {
      field: "brand",
      source: "column",
      columnIndex: 4,
      required: false,
    },

    {
      field: "dispatchDate",
      source: "header",
      label: "DESPATCH DATE",
      required: false,
    },
  ],

  rowRule: {
    minimumFields: 2,
    multiline: false,
  },

  // --------------------------------------------------
  // STOCK DEFINITION
  // --------------------------------------------------
  //
  // This synthetic test contains one stock column.
  // Therefore the stock represents BOX quantity.
  //
  // The real supplier PDF can contain separate
  // BOX + PCS quantities. That will be handled by
  // the learned template for that document.
  // --------------------------------------------------

  stockDefinition: {
    unit: "box",
    boxColumnIndex: 3,
    piecesPerBoxVariable: false,
  },

  structuralAnchors: [
    "Stock Report",
    "DESPATCH DATE",
  ],
};


// ------------------------------------------------------------
// WEEK 1
// ------------------------------------------------------------

const week1 = `
TILE STOCK REPORT
DESPATCH DATE : 27-07-2026

Item      Size      Finish      Stock      Brand
Sterling Crema      1200X600      Glossy      128      SHREEM
Lebia Grey          1200X600      Glossy      1011     SHREEM
Foggy Aqua          1200X600      Glossy      295      SHREEM
`;


// ------------------------------------------------------------
// WEEK 2
// Same layout - different stock/date
// ------------------------------------------------------------

const week2 = `
TILE STOCK REPORT
DESPATCH DATE : 03-08-2026

Item      Size      Finish      Stock      Brand
Sterling Crema      1200X600      Glossy      250      SHREEM
Lebia Grey          1200X600      Glossy      900      SHREEM
Foggy Aqua          1200X600      Glossy      410      SHREEM
`;


// ------------------------------------------------------------
// BUILD DOCUMENT MODELS
// ------------------------------------------------------------

const document1 =
  documentBuilder.build(week1);

const document2 =
  documentBuilder.build(week2);


// ------------------------------------------------------------
// LOCAL EXTRACTION
// ------------------------------------------------------------

const result1 =
  learnedTemplateExtractor.extract(
    document1,
    template
  );

const result2 =
  learnedTemplateExtractor.extract(
    document2,
    template
  );


// ------------------------------------------------------------
// WEEK 1 RESULT
// ------------------------------------------------------------

console.log("\n==============================");
console.log("WEEK 1 LOCAL EXTRACTION");
console.log("==============================");

console.log(
  JSON.stringify(
    result1,
    null,
    2
  )
);


// ------------------------------------------------------------
// WEEK 2 RESULT
// ------------------------------------------------------------

console.log("\n==============================");
console.log("WEEK 2 LOCAL EXTRACTION");
console.log("==============================");

console.log(
  JSON.stringify(
    result2,
    null,
    2
  )
);