import layoutSignature from "./templateEngine/fingerprint/layoutSignature.js";

const pdf1 = `
SHREEM CERAMICS

ITEM      QTY     RATE
600X600   40      520
800X800   20      650
`;

const pdf2 = `
SHREEM CERAMICS

ITEM      QTY     RATE
600X600   75      540
800X800   10      660
`;

console.log("PDF 1");
console.log(layoutSignature.generate(pdf1));

console.log();

console.log("PDF 2");
console.log(layoutSignature.generate(pdf2));