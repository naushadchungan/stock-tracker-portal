import repository from "./templateEngine/repository/templateRepository.js";

console.log("Saving test template...");

repository.save({
  fingerprint: "TEST_FP_001",
  supplier: "Demo Supplier",
  version: 1,
  templateJson: JSON.stringify({
    columns: [
      "Item",
      "Qty",
      "Unit"
    ]
  }),
  confidence: 98
});

console.log("Reading template...");

const result = repository.findByFingerprint("TEST_FP_001");

console.log(result);

console.log("Listing all templates...");

console.log(repository.list());