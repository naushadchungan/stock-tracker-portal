import type { DocumentParser } from "../parsers/interfaces";

const parsers: DocumentParser[] = [];

export function registerParser(
  parser: DocumentParser
) {
  parsers.push(parser);
}

export function getRegisteredParsers() {
  return parsers;
}