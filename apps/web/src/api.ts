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
export const apiOrigin = () => API_BASE || location.origin;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Máy thử không trả lời được.");
  return payload;
}

const request = api;

export type CloudUser = { id: string; email: string; displayName: string; role: "player" | "admin" };
export type CloudBot = { botId: string; revision: number; bot: BotDefinition; createdAt: number; updatedAt: number };
export const googleConfig = () => api<{ clientId: string }>("/api/auth/google-config");
export const authMe = () => api<{ authenticated: true; user: CloudUser }>("/api/auth/me");
export const googleLogin = (credential: string) => api<{ user: CloudUser }>("/api/auth/google", { credential });
export const logout = () => api<{ ok: true }>("/api/auth/logout", {});
export const listCloudBots = (cursor = 0) => api<{ bots: CloudBot[]; nextCursor: number | null }>(`/api/v1/bots?limit=50&cursor=${cursor}`);
export const getCloudBot = (id: string) => api<{ botId: string; revision: number; bot: BotDefinition; versions: { packageHash: string; revision: number }[] }>(`/api/v1/bots/${encodeURIComponent(id)}`);
export const createCloudBot = (bot: BotDefinition) => api<{ botId: string; revision: number }>("/api/v1/bots", { bot });
export const editCloudBot = (id: string, revision: number, bot: BotDefinition) => api<{ botId: string; revision: number }>(`/api/v1/bots/${encodeURIComponent(id)}/edit`, { revision, bot });
export const validateCloudBot = (id: string) => api<{ report: ValidationReport; package: BotPackage | null }>(`/api/v1/bots/${encodeURIComponent(id)}/validate`, {});
export const simulateCloudBot = (id: string, opponent: string, seed: number) => api<{ replayId: string; status: string }>(`/api/v1/bots/${encodeURIComponent(id)}/simulate`, { opponent, seed });
export const getCloudReplay = (id: string) => api<{ replay: import("@prompt-chien/contracts").ReplayData }>(`/api/v1/replays/${encodeURIComponent(id)}`);

export const inspectBot = (bot: BotDefinition) => request<InspectResponse>("/api/inspect", { bot });
export const validateRequest = (bot: BotDefinition) => request<ValidateResponse>("/api/validate", { bot });
export const simulateRequest = (a: BotDefinition | BotPackage, b: BotDefinition | BotPackage, seed: number, mode: "test" | "official") =>
  request<SimulateResponse>("/api/simulate", { a, b, seed, mode });
export const referenceBots = () => request<{ bots: ReferenceBot[] }>("/api/references");
