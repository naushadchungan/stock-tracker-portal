import documentBuilder from "./templateEngine/builders/documentBuilder.js";
import templateMatcher from "./templateEngine/services/templateMatcher.js";
import templateRepository from "./templateEngine/repository/templateRepository.js";

const pdf = `
SHREEM CERAMICS

Stock Report

Item      Qty      Rate

600X600   100      750
800X800   200      850
`;

const document = documentBuilder.build(pdf);

const firstCheck = templateMatcher.match(document);

console.log("FIRST CHECK");
console.log(firstCheck);

if (!firstCheck.found) {
  console.log("Unknown layout - simulating Claude learning...");

  templateRepository.save({
    fingerprint: firstCheck.fingerprint,
    supplier: null,
    version: 1,

    templateJson: JSON.stringify({
      columns: document.tables[0]?.columns ?? [],
    }),

    confidence: 95,
  });
}

console.log();

const secondCheck = templateMatcher.match(document);

console.log("SECOND CHECK");
console.log(secondCheck);