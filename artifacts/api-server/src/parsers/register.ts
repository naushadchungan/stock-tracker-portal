import { registerParser } from "../documentEngine/parserRegistry";

import { GenericParser } from "./generic/parser";
import { ShreemParser } from "./shreem/parser";

registerParser(new GenericParser());
registerParser(new ShreemParser());