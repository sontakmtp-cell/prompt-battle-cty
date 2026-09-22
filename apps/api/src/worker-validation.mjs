import { CONTRACT_SCHEMA } from "@prompt-chien/contracts/schema";

function equal(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

const pointer = value => String(value).replace(/~/g, "~0").replace(/\//g, "~1");
const issue = (path, message) => ({ code: "SCHEMA_INVALID", path, message });

function validate(schema, value, root, path = "") {
  if (!schema || typeof schema !== "object") return [];
  if (schema.$ref) {
    const name = String(schema.$ref).split("/").pop();
    return validate(root.$defs[name], value, root, path);
  }
  if (schema.const !== undefined && !equal(value, schema.const)) return [issue(path, `must equal ${JSON.stringify(schema.const)}`)];
  if (schema.enum && !schema.enum.some(candidate => equal(value, candidate))) return [issue(path, `must be one of: ${schema.enum.join(", ")}`)];
  if (schema.type === "object" || schema.properties || schema.required || schema.additionalProperties === false) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [issue(path, "must be an object")];
    const issues = [];
    for (const key of schema.required ?? []) if (!Object.prototype.hasOwnProperty.call(value, key)) issues.push(issue(`${path}/${pointer(key)}`, "is required"));
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!schema.properties?.[key]) issues.push(issue(`${path}/${pointer(key)}`, "is not allowed"));
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) issues.push(...validate(child, value[key], root, `${path}/${pointer(key)}`));
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) issues.push(issue(path, `must have at least ${schema.minProperties} properties`));
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) issues.push(issue(path, `must have at most ${schema.maxProperties} properties`));
    if (issues.length) return issues.slice(0, 20);
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [issue(path, "must be an array")];
    const issues = [];
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push(issue(path, `must contain at least ${schema.minItems} items`));
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push(issue(path, `must contain at most ${schema.maxItems} items`));
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) issues.push(issue(path, "must contain unique items"));
    if (schema.items) value.forEach((item, index) => issues.push(...validate(schema.items, item, root, `${path}/${index}`)));
    if (schema.contains) {
      const count = value.filter(item => validate(schema.contains, item, root).length === 0).length;
      if (schema.minContains !== undefined && count < schema.minContains) issues.push(issue(path, `must contain at least ${schema.minContains} matching items`));
      if (schema.maxContains !== undefined && count > schema.maxContains) issues.push(issue(path, `must contain at most ${schema.maxContains} matching items`));
    }
    if (issues.length) return issues.slice(0, 20);
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return [issue(path, "must be a string")];
    if (schema.minLength !== undefined && [...value].length < schema.minLength) return [issue(path, `must have at least ${schema.minLength} characters`)];
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) return [issue(path, `must have at most ${schema.maxLength} characters`)];
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) return [issue(path, `must match pattern ${schema.pattern}`)];
  }
  if (schema.type === "integer" && !Number.isSafeInteger(value)) return [issue(path, "must be an integer")];
  if (schema.type === "integer" && schema.minimum !== undefined && value < schema.minimum) return [issue(path, `must be at least ${schema.minimum}`)];
  if (schema.type === "integer" && schema.maximum !== undefined && value > schema.maximum) return [issue(path, `must be at most ${schema.maximum}`)];
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return [issue(path, "must be a finite number")];
  if (schema.type === "boolean" && typeof value !== "boolean") return [issue(path, "must be a boolean")];
  if (schema.type === "null" && value !== null) return [issue(path, "must be null")];
  if (schema.oneOf) {
    const candidates = schema.oneOf.map(candidate => validate(candidate, value, root, path));
    const matches = candidates.filter(errors => errors.length === 0).length;
    if (matches > 1) return [issue(path, "must match exactly one allowed shape")];
    if (matches === 0) return candidates.reduce((best, errors) => errors.length < best.length ? errors : best).slice(0, 20);
  }
  if (schema.anyOf) {
    const candidates = schema.anyOf.map(candidate => validate(candidate, value, root, path));
    if (!candidates.some(errors => errors.length === 0)) return candidates.reduce((best, errors) => errors.length < best.length ? errors : best).slice(0, 20);
  }
  if (schema.if && validate(schema.if, value, root, path).length === 0 && schema.then) return validate(schema.then, value, root, path);
  return [];
}

export const workerValidators = {
  BotDefinition: value => validate(CONTRACT_SCHEMA.$defs.BotDefinition, value, CONTRACT_SCHEMA),
  BotPackage: value => validate(CONTRACT_SCHEMA.$defs.BotPackage, value, CONTRACT_SCHEMA),
  BrainProgram: value => validate(CONTRACT_SCHEMA.$defs.BrainProgram, value, CONTRACT_SCHEMA),
  ReplayData: value => validate(CONTRACT_SCHEMA.$defs.ReplayData, value, CONTRACT_SCHEMA),
};

globalThis.__PROMPTCHIEN_CONTRACT_VALIDATOR_FUNCTIONS__ = workerValidators;
