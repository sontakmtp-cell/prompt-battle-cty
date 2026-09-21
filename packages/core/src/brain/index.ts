import { RULESET } from "@prompt-chien/contracts";
import type { BrainAction, BrainProgram, Condition, IntExpression, Issue, Sensor } from "@prompt-chien/contracts";
import { checkSchema } from "@prompt-chien/contracts/validation";

export type BrainCheck = { ok: boolean; issues: Issue[]; nodes: number; depth: number };

/** Static validation; runtime budgets are enforced separately by tickBrain. */
export function validateBrain(input: unknown): BrainCheck {
  const schema = checkSchema("BrainProgram", input);
  if (!schema.ok) return { ok: false, issues: schema.issues, nodes: 0, depth: 0 };
  const brain = schema.value;
  const issues: Issue[] = [];
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const states = new Set<string>();
  const variables = new Set<string>();
  for (const [index, state] of brain.states.entries()) {
    if (states.has(state.name)) issue("DUPLICATE_STATE", `/states/${index}/name`, `Duplicate state: ${state.name}`);
    states.add(state.name);
  }
  for (const [index, variable] of brain.variables.entries()) {
    if (variables.has(variable.name)) issue("DUPLICATE_VARIABLE", `/variables/${index}/name`, `Duplicate variable: ${variable.name}`);
    variables.add(variable.name);
  }
  if (!states.has(brain.initialState)) issue("UNKNOWN_STATE", "/initialState", "Initial state does not exist.");

  let nodes = 0;
  let depth = 0;
  const stack: { value: unknown; path: string; parentDepth: number }[] = [{ value: brain, path: "", parentDepth: 0 }];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.value === null || typeof current.value !== "object") continue;
    const objectDepth = current.parentDepth + (Array.isArray(current.value) ? 0 : 1);
    if (!Array.isArray(current.value)) {
      nodes++;
      depth = Math.max(depth, objectDepth);
      if (nodes > RULESET.brain.maxNodes || depth > RULESET.brain.maxDepth) {
        issue("BRAIN_LIMIT", current.path, "Brain exceeds 256 object nodes or 16 object levels.");
        break;
      }
      const node = current.value as Record<string, unknown>;
      if (node.kind === "variable" && !variables.has(node.name as string)) {
        issue("UNKNOWN_VARIABLE", `${current.path}/name`, `Undeclared variable: ${node.name}`);
      }
    }
    for (const [key, value] of Object.entries(current.value)) {
      stack.push({ value, path: `${current.path}/${key}`, parentDepth: objectDepth });
    }
  }
  for (const [stateIndex, state] of brain.states.entries()) {
    for (const [ruleIndex, rule] of state.rules.entries()) {
      const path = `/states/${stateIndex}/rules/${ruleIndex}`;
      if (rule.nextState !== undefined && !states.has(rule.nextState)) issue("UNKNOWN_STATE", `${path}/nextState`, `Unknown state: ${rule.nextState}`);
      const written = new Set<string>();
      for (const [index, assignment] of (rule.set ?? []).entries()) {
        if (!variables.has(assignment.name)) issue("UNKNOWN_VARIABLE", `${path}/set/${index}`, `Undeclared variable: ${assignment.name}`);
        if (written.has(assignment.name)) issue("DUPLICATE_WRITE", `${path}/set/${index}`, "A variable can only be assigned once per rule.");
        written.add(assignment.name);
      }
    }
  }
  return { ok: issues.length === 0, issues, nodes, depth };
}

export type BrainMemory = { state: string; stateTicks: number; variables: Record<string, number>; violations: number };
export type BrainTick = { memory: BrainMemory; action: BrainAction; steps: number; exceeded: boolean };
export const IDLE_ACTION: BrainAction = { move: { mode: "stop", power: 0 }, turn: { mode: "hold", power: 0, offset: 0 } };
export function initialMemory(program: BrainProgram): BrainMemory {
  return { state: program.initialState, stateTicks: 0, violations: 0, variables: Object.fromEntries(program.variables.map(v => [v.name, v.initial])) };
}

/** Interpret validated JSON. Commit writes only after the entire selected rule succeeds. */
export function tickBrain(program: BrainProgram, memory: BrainMemory, sensors: Record<Sensor, number>, budget: number = RULESET.brain.stepsPerTick): BrainTick {
  if (!Number.isInteger(budget) || budget < 0 || budget > RULESET.brain.stepsPerTick) throw new Error("Invalid Brain budget");
  let steps = 0;
  const exhausted = {};
  const step = () => { if (steps >= budget) throw exhausted; steps++; };
  const integer = (value: number) => Math.max(-2147483648, Math.min(2147483647, value));
  const expression = (node: IntExpression): number => {
    step();
    switch (node.kind) {
      case "constant": return node.value;
      case "sensor": return sensors[node.name];
      case "variable": return memory.variables[node.name]!;
      case "math": {
        const a = expression(node.left), b = expression(node.right);
        switch (node.op) { case "add": return integer(a+b); case "subtract": return integer(a-b); case "min": return Math.min(a,b); case "max": return Math.max(a,b); }
      }
    }
  };
  const condition = (node: Condition): boolean => {
    step();
    switch (node.op) {
      case "always": return true;
      case "all": return node.args.every(condition);
      case "any": return node.args.some(condition);
      case "not": return !condition(node.arg);
      case "compare": {
        const a = expression(node.left), b = expression(node.right);
        switch (node.cmp) { case "eq": return a===b; case "ne": return a!==b; case "lt": return a<b; case "lte": return a<=b; case "gt": return a>b; case "gte": return a>=b; }
      }
    }
  };
  const state = program.states.find(s => s.name === memory.state);
  if (!state) throw new Error("Corrupt Brain state");
  try {
    for (const rule of state.rules) {
      step(); if (!condition(rule.when)) continue;
      step(); step();
      const variables = { ...memory.variables };
      for (const assignment of rule.set ?? []) { step(); variables[assignment.name] = expression(assignment.value); }
      if (rule.nextState !== undefined) step();
      const next = rule.nextState ?? memory.state;
      return { action: rule.action, memory: { state: next, stateTicks: next === memory.state ? memory.stateTicks + 1 : 0, variables, violations: 0 }, steps, exceeded: false };
    }
    return { action: IDLE_ACTION, memory: { ...memory, stateTicks: memory.stateTicks + 1, violations: 0 }, steps, exceeded: false };
  } catch (error) {
    if (error !== exhausted) throw error;
    return { action: IDLE_ACTION, memory: { ...memory, stateTicks: memory.stateTicks + 1, violations: memory.violations + 1 }, steps, exceeded: true };
  }
}
