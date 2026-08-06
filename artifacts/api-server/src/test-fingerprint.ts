import fingerprintEngine from "./templateEngine/fingerprint/fingerprintEngine.js";

const sampleText = `
SHREEM CERAMICS

ITEM        QTY
600X600     40
800X800     20
`;

const fingerprint = fingerprintEngine.generate(sampleText);

console.log("Fingerprint:");
console.log(fingerprint);