import { validateLearnedTemplate } from "./templateEngine/validator/templateValidator.js";
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
      label: "Dispatch Date",
      required: false,
    },
    {
      field: "photo",
      source: "image",
      required: false,
    },
  ],

  rowRule: {
    minimumFields: 2,
    multiline: true,
  },

  stockDefinition: {
    unit: "box",
    boxColumnIndex: 3,
    piecesPerBoxVariable: false,
  },

  structuralAnchors: [
    "Stock Report",
  ],

  learningNotes: [
    "Validator test template",
  ],
};

const result =
  validateLearnedTemplate(template);

console.log("TEMPLATE VALIDATION");
console.log("===================");

console.log(result);