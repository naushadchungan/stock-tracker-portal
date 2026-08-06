import documentBuilder from "./templateEngine/builders/documentBuilder.js";

const sample = `
SHREEM CERAMICS

Stock Report

Item      Qty      Rate

600X600   40       520
800X800   20       650
`;

const model = documentBuilder.build(sample);

console.log(JSON.stringify(model, null, 2));