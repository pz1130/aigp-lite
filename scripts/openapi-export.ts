import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOpenApiDocument } from "../src/lib/openapi/generate";

const outPath = resolve(process.cwd(), "openapi.json");
writeFileSync(outPath, `${JSON.stringify(getOpenApiDocument(), null, 2)}\n`);
console.log(`OpenAPI document written to ${outPath}`);
