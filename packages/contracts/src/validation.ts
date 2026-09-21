import { Ajv2020 } from "ajv/dist/2020.js";
import { CONTRACT_SCHEMA } from "./schema.js";
import type { ContractMap, Issue } from "./types.js";

const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addSchema(CONTRACT_SCHEMA);

export type SchemaCheck<T> = { ok: true; value: T; issues: [] } | { ok: false; issues: Issue[] };

export function checkSchema<K extends keyof ContractMap>(name: K, input: unknown): SchemaCheck<ContractMap[K]> {
  // Bound recursive input before Ajv enters recursive Brain definitions. No coercion/default insertion.
  const stack: { value: unknown; depth: number; leaving?: boolean }[] = [{ value: input, depth: 0 }];
  const seen = new Set<object>();
  let visited = 0;
  while (stack.length) {
    const { value, depth, leaving } = stack.pop()!;
    if (leaving) { seen.delete(value as object); continue; }
    if (++visited > 4000000 || depth > 64 || (typeof value === "number" && !Number.isSafeInteger(value))) {
      return { ok: false, issues: [{ code: "INPUT_LIMIT", path: "", message: "Input must use safe integers and bounded JSON (depth <= 64)." }] };
    }
    if (value !== null && typeof value === "object") {
      if (seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
        return { ok: false, issues: [{ code: "INVALID_JSON", path: "", message: "Expected JSON data without cycles or class instances." }] };
      }
      seen.add(value);
      stack.push({ value, depth, leaving: true });
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
    } else if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      return { ok: false, issues: [{ code: "INVALID_JSON", path: "", message: "Only JSON values are allowed." }] };
    }
  }
  const validate = ajv.getSchema<ContractMap[K]>(`${CONTRACT_SCHEMA.$id}#/$defs/${name}`)!;
  if (validate(input)) return { ok: true, value: input as ContractMap[K], issues: [] };
  return { ok: false, issues: (validate.errors ?? []).slice(0, 20).map(error => ({
    code: "SCHEMA_INVALID", path: error.instancePath, message: error.message ?? "Invalid data",
  })) };
}
