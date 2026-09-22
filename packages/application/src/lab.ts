import { canonicalJson, hashJson } from "@prompt-chien/contracts";
import type { BotDefinition, BotPackage } from "@prompt-chien/contracts";

// Local lab records. The browser persists this JSON; nothing here opens a database or a socket.
export type DraftRecord = { id: string; ownerId: string; revision: number; definition: BotDefinition };
export type VersionRecord = { draftId: string; ownerId: string; revision: number; package: BotPackage };
export type QueueStatus = "waiting" | "running" | "done";
export type QueueRecord = {
  id: string; ownerId: string; package: BotPackage;
  status: QueueStatus; order: number; replayId: string | null;
};
export type LabStore = { drafts: DraftRecord[]; versions: VersionRecord[]; queue: QueueRecord[]; nextOrder: number };
export type LabFail = { ok: false; code: string; message: string };
export type LabOk<T extends Record<string, unknown>> = { ok: true; store: LabStore } & T;

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (code: string, message: string): LabFail => ({ ok: false, code, message });

export function emptyStore(): LabStore {
  return { drafts: [], versions: [], queue: [], nextOrder: 1 };
}

export function ownerBusy(store: LabStore, ownerId: string): boolean {
  return store.queue.some(entry => entry.ownerId === ownerId && entry.status !== "done");
}

function sameDefinition(a: BotDefinition, b: BotDefinition): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

async function hashed(pkg: BotPackage): Promise<LabFail | null> {
  let actual = "";
  try { actual = await hashJson({ versions: pkg.versions, definition: pkg.definition }); }
  catch { return fail("BAD_PACKAGE", "Package is not valid JSON."); }
  if (actual !== pkg.packageHash) return fail("HASH_MISMATCH", "Package hash does not match its definition.");
  return null;
}

export function writeDraft(store: LabStore, input: { id: string; ownerId: string; expectedRevision: number; definition: BotDefinition }): LabOk<{ draft: DraftRecord }> | LabFail {
  if (!ID.test(input.id) || !ID.test(input.ownerId)) return fail("BAD_ID", "Draft and owner ids must be short public identifiers.");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) return fail("REVISION_CONFLICT", "Revision is not the one currently open.");
  let definition: BotDefinition;
  try { definition = clone(input.definition); canonicalJson(definition); }
  catch { return fail("BAD_DEFINITION", "Draft must be JSON with safe integers."); }
  const next = clone(store);
  const index = next.drafts.findIndex(draft => draft.id === input.id);
  if (input.expectedRevision === 0) {
    if (index >= 0) return fail("REVISION_CONFLICT", "Draft already exists.");
    const draft = { id: input.id, ownerId: input.ownerId, revision: 1, definition };
    next.drafts.push(draft);
    return { ok: true, store: next, draft: clone(draft) };
  }
  const current = next.drafts[index];
  if (!current) return fail("UNKNOWN_DRAFT", "Draft does not exist.");
  if (current.ownerId !== input.ownerId) return fail("NOT_OWNER", "Only the owner can edit this draft.");
  if (current.revision !== input.expectedRevision) return fail("REVISION_CONFLICT", "Draft revision is newer than the one you edited.");
  current.revision += 1;
  current.definition = definition;
  return { ok: true, store: next, draft: clone(current) };
}

export async function recordVersion(store: LabStore, input: { draftId: string; ownerId: string; expectedRevision: number; package: BotPackage }): Promise<LabOk<{ version: VersionRecord }> | LabFail> {
  const draft = store.drafts.find(item => item.id === input.draftId);
  if (!draft) return fail("UNKNOWN_DRAFT", "Draft does not exist.");
  if (draft.ownerId !== input.ownerId) return fail("NOT_OWNER", "Only the owner can keep a version of this draft.");
  if (draft.revision !== input.expectedRevision) return fail("REVISION_CONFLICT", "Validate the revision you are editing.");
  const hashedError = await hashed(input.package);
  if (hashedError) return hashedError;
  let matches = false;
  try { matches = sameDefinition(draft.definition, input.package.definition); }
  catch { return fail("BAD_DEFINITION", "Draft must be JSON with safe integers."); }
  if (!matches) return fail("STALE_DRAFT", "The checked package is not the draft currently saved.");
  const next = clone(store);
  const version = { draftId: input.draftId, ownerId: input.ownerId, revision: input.expectedRevision, package: clone(input.package) };
  const index = next.versions.findIndex(item => item.draftId === version.draftId && item.revision === version.revision);
  if (index >= 0) next.versions[index] = version;
  else next.versions.push(version);
  return { ok: true, store: next, version: clone(version) };
}

export function submitOwn(store: LabStore, input: { id: string; ownerId: string; packageHash: string }): LabOk<{ entry: QueueRecord }> | LabFail {
  if (!ID.test(input.id)) return fail("BAD_ID", "Queue id must be a short public identifier.");
  if (store.queue.some(entry => entry.id === input.id)) return fail("BAD_ID", "Queue id already exists.");
  const version = [...store.versions].reverse().find(item => item.ownerId === input.ownerId && item.package.packageHash === input.packageHash);
  if (!version) return fail("VERSION_REQUIRED", "Submit the exact package that passed validation.");
  if (ownerBusy(store, input.ownerId)) return fail("ALREADY_QUEUED", "This player already has a queue entry or a match in progress.");
  return enqueue(store, { id: input.id, ownerId: input.ownerId, package: version.package });
}

export async function enqueueOpponent(store: LabStore, input: { id: string; ownerId: string; package: BotPackage }): Promise<LabOk<{ entry: QueueRecord }> | LabFail> {
  if (!ID.test(input.id) || !ID.test(input.ownerId)) return fail("BAD_ID", "Queue and owner ids must be short public identifiers.");
  if (store.queue.some(entry => entry.id === input.id)) return fail("BAD_ID", "Queue id already exists.");
  const hashedError = await hashed(input.package);
  if (hashedError) return hashedError;
  if (ownerBusy(store, input.ownerId)) return fail("ALREADY_QUEUED", "This player already has a queue entry or a match in progress.");
  return enqueue(store, input);
}

function enqueue(store: LabStore, input: { id: string; ownerId: string; package: BotPackage }): LabOk<{ entry: QueueRecord }> {
  const next = clone(store);
  const entry: QueueRecord = {
    id: input.id, ownerId: input.ownerId, package: clone(input.package),
    status: "waiting", order: next.nextOrder, replayId: null,
  };
  next.nextOrder += 1;
  next.queue.push(entry);
  return { ok: true, store: next, entry: clone(entry) };
}

function compatible(a: BotPackage, b: BotPackage): boolean {
  return a.versions.engine === b.versions.engine && a.versions.ruleset === b.versions.ruleset;
}

/** Oldest waiting pair of different owners on the same engine and ruleset. */
export function takePair(store: LabStore): LabOk<{ pair: { a: QueueRecord; b: QueueRecord } | null }> {
  const waiting = store.queue.filter(entry => entry.status === "waiting").sort((a, b) => a.order - b.order);
  let found: [QueueRecord, QueueRecord] | null = null;
  for (let i = 0; i < waiting.length && !found; i++) for (let j = i + 1; j < waiting.length && !found; j++) {
    const a = waiting[i], b = waiting[j];
    if (a && b && a.ownerId !== b.ownerId && compatible(a.package, b.package)) found = [a, b];
  }
  if (!found) return { ok: true, store, pair: null };
  const next = clone(store);
  for (const chosen of found) {
    const entry = next.queue.find(item => item.id === chosen.id);
    if (entry) entry.status = "running";
  }
  const a = next.queue.find(item => item.id === found[0].id);
  const b = next.queue.find(item => item.id === found[1].id);
  return { ok: true, store: next, pair: a && b ? { a: clone(a), b: clone(b) } : null };
}

export function finishPair(store: LabStore, aId: string, bId: string, replayId: string): LabOk<{ settled: true }> | LabFail {
  return settle(store, aId, bId, "done", replayId);
}

export function releasePair(store: LabStore, aId: string, bId: string): LabOk<{ settled: true }> | LabFail {
  return settle(store, aId, bId, "waiting", null);
}

function settle(store: LabStore, aId: string, bId: string, status: "done" | "waiting", replayId: string | null): LabOk<{ settled: true }> | LabFail {
  const next = clone(store);
  const a = next.queue.find(item => item.id === aId);
  const b = next.queue.find(item => item.id === bId);
  if (!a || !b || a.status !== "running" || b.status !== "running") return fail("NOT_RUNNING", "That pair is not the match currently running.");
  a.status = status; b.status = status; a.replayId = replayId; b.replayId = replayId;
  return { ok: true, store: next, settled: true };
}

export function reclaimRunning(store: LabStore): LabStore {
  const next = clone(store);
  for (const entry of next.queue) if (entry.status === "running") entry.status = "waiting";
  return next;
}

export function renameOwner(store: LabStore, fromId: string, toId: string): LabOk<{ renamed: true }> | LabFail {
  if (!ID.test(fromId) || !ID.test(toId)) return fail("BAD_ID", "Owner id must be a short public identifier.");
  if (fromId === toId) return { ok: true, store, renamed: true };
  if (store.drafts.some(item => item.ownerId === toId) || store.versions.some(item => item.ownerId === toId) || store.queue.some(item => item.ownerId === toId)) {
    return fail("NAME_TAKEN", "That player name is already used in this browser.");
  }
  const next = clone(store);
  for (const item of next.drafts) if (item.ownerId === fromId) item.ownerId = toId;
  for (const item of next.versions) if (item.ownerId === fromId) item.ownerId = toId;
  for (const item of next.queue) if (item.ownerId === fromId) item.ownerId = toId;
  return { ok: true, store: next, renamed: true };
}

/** Stable seed for a local pairing. Queue order is part of the seed; the engine treats it as a uint32. */
export function matchSeed(firstHash: string, secondHash: string): number {
  let hash = 2166136261;
  for (const char of `${firstHash}|${secondHash}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
