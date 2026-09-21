import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CONTRACT_SCHEMA, SCHEMA_FILES } from "@prompt-chien/contracts/schema";

const directory = new URL("../schemas/", import.meta.url);
const files = { "contracts.json": CONTRACT_SCHEMA };
for (const [filename, name] of Object.entries(SCHEMA_FILES)) {
  files[filename] = {
    $schema: CONTRACT_SCHEMA.$schema,
    $id: new URL(filename, CONTRACT_SCHEMA.$id).href,
    $ref: `contracts.json#/$defs/${name}`,
  };
}
if (!process.argv.includes("--check")) mkdirSync(directory, { recursive: true });
for (const [filename, value] of Object.entries(files)) {
  const path = new URL(filename, directory);
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== expected) throw new Error(`${filename} is stale. Run pnpm schema.`);
  } else writeFileSync(path, expected);
}
console.log(`Schemas: ${Object.keys(files).length} files verified in ${fileURLToPath(directory)}`);
