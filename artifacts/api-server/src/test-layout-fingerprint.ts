import documentBuilder from "./templateEngine/builders/documentBuilder.js";
import layoutFingerprintEngine from "./templateEngine/fingerprint/layoutFingerprintEngine.js";

const pdf1 = `
SHREEM CERAMICS

Stock Report

Item      Qty      Rate

600X600   40       520
800X800   20       650
`;

const pdf2 = `
SHREEM CERAMICS

Stock Report

Item      Qty      Rate

600X600   500       999
800X800   1         888
`;

const doc1 = documentBuilder.build(pdf1);
const doc2 = documentBuilder.build(pdf2);

const fp1 = layoutFingerprintEngine.generate(doc1);
const fp2 = layoutFingerprintEngine.generate(doc2);

console.log("Fingerprint 1:", fp1);
console.log("Fingerprint 2:", fp2);

console.log();
console.log("Match:", fp1 === fp2);