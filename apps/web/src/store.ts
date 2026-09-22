import type { ReplayData } from "@prompt-chien/contracts";
import { emptyStore, reclaimRunning } from "@prompt-chien/application/lab";
import type { LabStore } from "@prompt-chien/application/lab";
import type { DisplayTriangle } from "@prompt-chien/ui";
import type { Tactic } from "./tactics.js";

const LAB_KEY = "prompt-chien.lab.v1";
const META_KEY = "prompt-chien.meta.v1";

export type Meta = { playerName: string; activeDraftId: string | null; tactics: Record<string, Tactic> };
export type SavedReplay = {
  id: string; created: number; title: string; seed: number; mode: "test" | "official";
  replay: ReplayData; shapes: Record<"A" | "B", DisplayTriangle[]>;
};

export function ownerIdFromName(name: string): string {
  const slug = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return `nguoi-${slug || "ban"}`;
}

export function loadMeta(): Meta {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) ?? "") as Meta;
    if (parsed && typeof parsed.playerName === "string" && parsed.tactics && typeof parsed.tactics === "object") return parsed;
  } catch { /* a fresh browser store is a valid start */ }
  return { playerName: "Bạn", activeDraftId: null, tactics: {} };
}

export function saveMeta(meta: Meta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function loadStore(): LabStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAB_KEY) ?? "") as LabStore;
    if (!parsed || !Array.isArray(parsed.drafts) || !Array.isArray(parsed.versions) || !Array.isArray(parsed.queue) || !Number.isInteger(parsed.nextOrder)) return emptyStore();
    return reclaimRunning(parsed);
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: LabStore): void {
  localStorage.setItem(LAB_KEY, JSON.stringify(store));
}

function openReplays(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("prompt-chien-lab", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("replays")) request.result.createObjectStore("replays", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveReplay(record: SavedReplay): Promise<void> {
  const db = await openReplays();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("replays", "readwrite");
    tx.objectStore("replays").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const all = await listReplays();
  const extra = all.slice(8);
  if (!extra.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("replays", "readwrite");
    for (const item of extra) tx.objectStore("replays").delete(item.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listReplays(): Promise<SavedReplay[]> {
  const db = await openReplays();
  const rows = await new Promise<SavedReplay[]>((resolve, reject) => {
    const request = db.transaction("replays").objectStore("replays").getAll();
    request.onsuccess = () => resolve(request.result as SavedReplay[]);
    request.onerror = () => reject(request.error);
  });
  return rows.sort((a, b) => b.created - a.created);
}

export async function loadReplay(id: string): Promise<SavedReplay | null> {
  const db = await openReplays();
  return new Promise((resolve, reject) => {
    const request = db.transaction("replays").objectStore("replays").get(id);
    request.onsuccess = () => resolve((request.result as SavedReplay | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}
