import { CONTRACT_SCHEMA } from "@prompt-chien/contracts/schema";

function equal(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function validate(schema, value, root) {
  if (!schema || typeof schema !== "object") return true;
  if (schema.$ref) {
    const name = String(schema.$ref).split("/").pop();
    return validate(root.$defs[name], value, root);
  }
  if (schema.const !== undefined && !equal(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some(candidate => equal(value, candidate))) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (schema.required?.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !schema.properties?.[key])) return false;
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !validate(child, value[key], root)) return false;
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) return false;
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) return false;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items && value.some(item => !validate(schema.items, item, root))) return false;
    if (schema.contains) {
      const count = value.filter(item => validate(schema.contains, item, root)).length;
      if (schema.minContains !== undefined && count < schema.minContains) return false;
      if (schema.maxContains !== undefined && count > schema.maxContains) return false;
    }
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.minLength !== undefined && [...value].length < schema.minLength) return false;
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) return false;
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) return false;
  }
  if (schema.type === "integer" && (!Number.isSafeInteger(value) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) return false;
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.oneOf && schema.oneOf.filter(candidate => validate(candidate, value, root)).length !== 1) return false;
  if (schema.anyOf && !schema.anyOf.some(candidate => validate(candidate, value, root))) return false;
  if (schema.if && validate(schema.if, value, root) && schema.then && !validate(schema.then, value, root)) return false;
  return true;
}

export const workerValidators = {
  BotDefinition: value => validate(CONTRACT_SCHEMA.$defs.BotDefinition, value, CONTRACT_SCHEMA),
  BotPackage: value => validate(CONTRACT_SCHEMA.$defs.BotPackage, value, CONTRACT_SCHEMA),
  BrainProgram: value => validate(CONTRACT_SCHEMA.$defs.BrainProgram, value, CONTRACT_SCHEMA),
  ReplayData: value => validate(CONTRACT_SCHEMA.$defs.ReplayData, value, CONTRACT_SCHEMA),
};

globalThis.__PROMPTCHIEN_CONTRACT_VALIDATOR_FUNCTIONS__ = workerValidators;
