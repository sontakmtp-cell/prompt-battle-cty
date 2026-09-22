import type { BotDefinition, BotPackage, Issue, ValidationReport } from "@prompt-chien/contracts";
import type { DisplayTriangle } from "@prompt-chien/ui";

export type Inspection = {
  schema: "passed" | "failed";
  brain: "pending" | "passed" | "failed";
  geometry: "pending" | "passed" | "failed";
  issues: Issue[];
  warnings: Issue[];
  pending: readonly ["sandbox"];
  readyForSubmission: false;
};

export type ShapeReport = {
  ok: boolean;
  counts: Record<"hammer" | "scissor" | "paper" | "motor" | "total", number>;
  bounds: { width: number; height: number };
  coreId: string;
  motors: { left: number; center: number; right: number; nose: number; tail: number; mid: number };
  triangles: DisplayTriangle[];
};

export type InspectResponse = { inspection: Inspection; shape: ShapeReport | null };
export type ValidateResponse = { report: ValidationReport; package: BotPackage | null; trials: { seed: number; team: "A" | "B"; ticks: number; moved: boolean; approached: boolean; engaged: boolean }[] };
export type SimulateResponse = { replay: import("@prompt-chien/contracts").ReplayData; shapes: Record<"A" | "B", DisplayTriangle[]> };
export type ReferenceBot = { id: string; name: string; package: BotPackage };

const API_BASE = String((globalThis as typeof globalThis & { PROMPTCHIEN_API_BASE?: string }).PROMPTCHIEN_API_BASE ?? "").replace(/\/$/, "");

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Máy thử không trả lời được.");
  return payload;
}

export const inspectBot = (bot: BotDefinition) => request<InspectResponse>("/api/inspect", { bot });
export const validateRequest = (bot: BotDefinition) => request<ValidateResponse>("/api/validate", { bot });
export const simulateRequest = (a: BotDefinition | BotPackage, b: BotDefinition | BotPackage, seed: number, mode: "test" | "official") =>
  request<SimulateResponse>("/api/simulate", { a, b, seed, mode });
export const referenceBots = () => request<{ bots: ReferenceBot[] }>("/api/references");
