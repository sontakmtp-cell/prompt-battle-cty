import { canonicalJson, RULESET } from "@prompt-chien/contracts";
import type { BotDefinition, BotPackage, Issue, ReplayCheckpoint, Team, Triangle, TriType, ValidationReport, VfxEvent } from "@prompt-chien/contracts";
import { enqueueOpponent, finishPair, matchSeed, recordVersion, releasePair, renameOwner, submitOwn, takePair, writeDraft } from "@prompt-chien/application/lab";
import type { LabStore } from "@prompt-chien/application/lab";
import { captionEvent, cellAt, cellsInView, cellVertices, drawViewer, TEAM_FILL, TEAM_INK, viewCheckpoint } from "@prompt-chien/ui";
import type { DisplayTriangle, GridCell } from "@prompt-chien/ui";
import { apiOrigin, authMe, cancelCloudSubmission, createCloudBot, createCloudReplayShare, editCloudBot, getCloudBot, getCloudMatch, getCloudReplay, googleConfig, googleLogin, inspectBot, listCloudBots, listCloudSubmissions, logout, referenceBots, submitCloudBot, simulateCloudBot, simulateRequest, validateCloudBot, validateRequest } from "./api.js";
import type { CloudBot, CloudSubmission, CloudUser, Inspection, ReferenceBot, ShapeReport } from "./api.js";
import { starterDefinition } from "./starter.js";
import { loadMeta, loadReplay, loadStore, ownerIdFromName, saveMeta, saveReplay, saveStore, listReplays } from "./store.js";
import type { Meta, SavedReplay } from "./store.js";
import { DEFAULT_TACTIC, tacticBrain } from "./tactics.js";
import type { Tactic, TacticStyle } from "./tactics.js";

type Tool = TriType | "core" | "erase";
type Page = "editor" | "inspector" | "queue" | "replay";
type PendingSubmission = { key: string; botId: string; revision: number; userId: string };

const PENDING_SUBMIT_PREFIX = "prompt-chien.official-submit.v1.";
const SUBMISSION_LABEL: Record<string, string> = {
  queued: "Đang chờ ghép",
  matched: "Đã ghép, đang chuẩn bị",
  running: "Đang chạy trận official",
  completed: "Đã hoàn tất",
  failed: "Trận gặp lỗi",
  cancelled: "Đã hủy",
};

const ISSUE: Record<string, string> = {
  GEOMETRY_BUDGET: "Thân bot phải có từ 1 đến 60 tam giác.",
  DUPLICATE_CELL: "Hai tam giác đang chồng lên cùng một ô.",
  DUPLICATE_ID: "Có hai mảnh trùng mã.",
  CORE_ON_MOTOR: "Lõi không được đặt trên Motor.",
  CORE_COUNT: "Cần đúng một lõi, đặt trên Búa, Kéo hoặc Bao.",
  NO_MOTOR: "Cần ít nhất một Motor.",
  BODY_TOO_LARGE: "Bot vượt khung 12 × 12.",
  DISCONNECTED: "Mọi mảnh phải dính cạnh với phần có lõi. Chỉ chạm đỉnh thì chưa tính.",
  LOW_COMBAT: "Ít hơn năm mảnh chiến đấu.",
  OVERLOADED: "Motor đang kéo quá tải. Thêm Motor hoặc bớt mảnh.",
  MONOCULTURE: "Một loại chiếm quá 65% mảnh chiến đấu.",
  PASSIVE_BRAIN: "Bot phải tự tiến lại gần và đánh trúng ở cả sáu lần thử. Hãy tăng lực hoặc chọn Lao thẳng.",
  SCHEMA_INVALID: "Dữ liệu bot chưa đúng định dạng.",
  INPUT_LIMIT: "Bot quá lớn hoặc có số không hợp lệ.",
};

const app = {
  store: loadStore(),
  meta: loadMeta(),
  draftId: "",
  revision: 0,
  definition: starterDefinition(),
  saved: "",
  tactic: null as Tactic | null,
  tool: "hammer" as Tool,
  report: null as ValidationReport | null,
  package: null as BotPackage | null,
  shape: null as ShapeReport | null,
  inspection: null as Inspection | null,
  references: [] as ReferenceBot[],
  replay: null as SavedReplay | null,
  replays: [] as SavedReplay[],
  showDamage: false,
  speed: 1,
  playing: false,
  tick: 0,
  alpha: 0,
  lastTime: 0,
  page: "editor" as Page,
  sought: -1,
  checkpoint: null as ReplayCheckpoint | null,
  organic: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  cloudUser: null as CloudUser | null,
  cloudBotId: null as string | null,
  cloudRevision: 0,
  cloudSaved: "",
  cloudBots: [] as CloudBot[],
  cloudVersions: [] as { packageHash: string; revision: number }[],
  cloudSubmissions: [] as CloudSubmission[],
  pendingSubmission: null as PendingSubmission | null,
  officialQueueMessage: "",
  officialQueueLoading: false,
};

const $ = <T extends Element>(selector: string) => {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node as T;
};

function toast(message: string): void {
  $("#toast").textContent = message;
}

function owner(): string {
  return ownerIdFromName(app.meta.playerName);
}

function remember(): void {
  saveStore(app.store);
  saveMeta(app.meta);
}

function freshId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "")}`;
}

function useDraft(store: LabStore, id: string): void {
  const draft = store.drafts.find(item => item.id === id);
  if (!draft) return;
  app.store = store;
  app.draftId = draft.id;
  app.revision = draft.revision;
  app.definition = structuredClone(draft.definition);
  app.saved = canonicalJson(app.definition);
  app.tactic = app.meta.tactics[draft.id] ?? null;
  app.meta.activeDraftId = draft.id;
  app.report = null;
  app.package = null;
  const version = [...app.store.versions].reverse().find(item => item.draftId === draft.id && item.revision === draft.revision);
  if (version && canonicalJson(version.package.definition) === app.saved) app.package = version.package;
}

function createDraft(definition: BotDefinition, tactic: Tactic | null = { ...DEFAULT_TACTIC }): void {
  if (app.cloudUser) {
    app.cloudBotId = null;
    app.cloudRevision = 0;
    app.cloudSaved = "";
    app.cloudVersions = [];
    app.definition = structuredClone(definition);
    app.tactic = tactic;
    app.report = null;
    app.package = null;
    renderInspector();
    return;
  }
  const id = freshId("d");
  const written = writeDraft(app.store, { id, ownerId: owner(), expectedRevision: 0, definition });
  if (!written.ok) { toast(written.message); return; }
  app.tactic = tactic;
  if (tactic) {
    app.meta.tactics[id] = tactic;
  } else {
    delete app.meta.tactics[id];
  }
  useDraft(written.store, id);
  remember();
}

function ensureDraft(): void {
  const current = app.meta.activeDraftId ? app.store.drafts.find(item => item.id === app.meta.activeDraftId && item.ownerId === owner()) : undefined;
  const mine = current ?? app.store.drafts.find(item => item.ownerId === owner());
  if (mine) useDraft(app.store, mine.id);
  else createDraft(starterDefinition());
}

function commit(): boolean {
  let json = "";
  try { json = canonicalJson(app.definition); }
  catch { toast("Bot có dữ liệu không lưu được."); return false; }
  if (app.cloudUser) {
    if (json !== app.cloudSaved) { app.package = null; app.report = null; }
    queueInspect();
    return true;
  }
  if (json === app.saved) return true;
  const written = writeDraft(app.store, { id: app.draftId, ownerId: owner(), expectedRevision: app.revision, definition: app.definition });
  if (!written.ok) { toast(written.code === "REVISION_CONFLICT" ? "Bản nháp vừa đổi ở một thẻ khác. Hãy tải lại trang." : written.message); return false; }
  useDraft(written.store, written.draft.id);
  remember();
  queueInspect();
  return true;
}

let inspectTimer = 0;
let officialPollTimer = 0;
let officialPollFailures = 0;
let officialPollBusy = false;
function queueInspect(): void {
  window.clearTimeout(inspectTimer);
  inspectTimer = window.setTimeout(() => void refreshInspect(), 200);
}

async function refreshInspect(): Promise<void> {
  try {
    const result = await inspectBot(app.definition);
    app.inspection = result.inspection;
    app.shape = result.shape;
    paintBudget();
    renderInspector();
    renderIssues(result.inspection.issues, result.inspection.warnings);
  } catch (error) {
    toast(error instanceof Error ? error.message : "Không xem được hình bot.");
  }
}

function text(id: string, value: string): void {
  $(id).textContent = value;
}

function issueText(issue: Issue): string {
  return ISSUE[issue.code] ?? issue.message;
}

function renderIssues(errors: readonly Issue[], warnings: readonly Issue[]): void {
  const list = $("#issues");
  list.replaceChildren();
  for (const issue of errors) list.append(item(issueText(issue), "fail"));
  for (const issue of warnings) list.append(item(issueText(issue), ""));
}

function item(label: string, kind: string): HTMLLIElement {
  const row = document.createElement("li");
  row.textContent = label;
  if (kind) row.className = kind;
  return row;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function paintBudget(): void {
  const count = app.definition.body.triangles.length;
  const points = app.definition.body.triangles.flatMap(triangle => cellVertices(triangle.q, triangle.r, triangle.orientation));
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const size = points.length ? ` · rộng ${((Math.max(...xs) - Math.min(...xs)) / RULESET.scale).toFixed(1)} × cao ${((Math.max(...ys) - Math.min(...ys)) / RULESET.scale).toFixed(1)}` : "";
  text("#budget", `${count}/${RULESET.geometry.maxTriangles} tam giác${size}. Mũi bot hướng lên.`);
  const pill = document.querySelector("#budget-pill");
  if (pill) pill.textContent = `${count}/${RULESET.geometry.maxTriangles}`;
}

function editorCamera(canvas: HTMLCanvasElement): { scale: number; originX: number; originY: number } {
  const points = cellsInView().flatMap(cell => cellVertices(cell.q, cell.r, cell.orientation));
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 18;
  const scale = Math.min((canvas.width - pad * 2) / (maxX - minX), (canvas.height - pad * 2) / (maxY - minY));
  return { scale, originX: (canvas.width - (maxX + minX) * scale) / 2, originY: (canvas.height + (maxY + minY) * scale) / 2 };
}

function paintEditor(): void {
  const canvas = $<HTMLCanvasElement>("#editor-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const camera = editorCamera(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0B0F17";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(camera.scale, 0, 0, -camera.scale, camera.originX, camera.originY);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.4 / camera.scale;
  for (const cell of cellsInView()) {
    const vertices = cellVertices(cell.q, cell.r, cell.orientation);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    ctx.lineTo(vertices[1].x, vertices[1].y);
    ctx.lineTo(vertices[2].x, vertices[2].y);
    ctx.closePath();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
    ctx.stroke();
  }
  for (const triangle of app.definition.body.triangles) {
    const vertices = cellVertices(triangle.q, triangle.r, triangle.orientation);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    ctx.lineTo(vertices[1].x, vertices[1].y);
    ctx.lineTo(vertices[2].x, vertices[2].y);
    ctx.closePath();
    ctx.fillStyle = TEAM_FILL.A[triangle.type];
    ctx.globalAlpha = triangle.type === "paper" ? 0.75 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = triangle.type === "hammer" ? "#FDA4AF" : triangle.type === "scissor" ? "#FDBA74" : triangle.type === "paper" ? "#FDE047" : "#CBD5E1";
    ctx.lineWidth = (triangle.type === "hammer" ? 2.6 : 1.4) / camera.scale;
    ctx.setLineDash(triangle.type === "motor" ? [90, 70] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (triangle.core) {
      const center = { x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3, y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3 };
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 2.8 / camera.scale;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 220, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#FBBF24";
      ctx.beginPath();
      ctx.arc(center.x, center.y, 60, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  paintBudget();
}

function localPoint(event: PointerEvent): { x: number; y: number } | null {
  const canvas = $<HTMLCanvasElement>("#editor-canvas");
  const rect = canvas.getBoundingClientRect();
  const camera = editorCamera(canvas);
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (event.clientY - rect.top) * canvas.height / rect.height;
  return { x: (x - camera.originX) / camera.scale, y: (camera.originY - y) / camera.scale };
}

function makeTriangle(id: string, cell: GridCell, type: TriType, core: boolean): Triangle {
  if (type === "motor") return { id, q: cell.q, r: cell.r, orientation: cell.orientation, type, core: false };
  return { id, q: cell.q, r: cell.r, orientation: cell.orientation, type, core };
}

function nextTriangleId(): string {
  const used = new Set(app.definition.body.triangles.map(triangle => triangle.id));
  for (let index = 0; index < 1000; index++) if (!used.has(`t${index}`)) return `t${index}`;
  return freshId("t");
}

function paintCell(cell: GridCell): void {
  const triangles = app.definition.body.triangles;
  const index = triangles.findIndex(triangle => triangle.q === cell.q && triangle.r === cell.r && triangle.orientation === cell.orientation);
  const current = index >= 0 ? triangles[index] : undefined;
  if (app.tool === "erase") {
    if (index >= 0) triangles.splice(index, 1);
  } else if (app.tool === "core") {
    if (!current || current.type === "motor") { toast("Lõi chỉ đặt trên Búa, Kéo hoặc Bao."); return; }
    app.definition.body.triangles = triangles.map(triangle => makeTriangle(triangle.id, triangle, triangle.type, triangle.id === current.id));
  } else if (!current) {
    if (triangles.length >= RULESET.geometry.maxTriangles) { toast("Đã đủ 60 tam giác."); return; }
    const core = app.tool !== "motor" && !triangles.some(triangle => triangle.core);
    triangles.push(makeTriangle(nextTriangleId(), cell, app.tool, core));
  } else {
    const core = app.tool === "motor" ? false : current.core;
    triangles[index] = makeTriangle(current.id, cell, app.tool, core);
  }
  commit();
  paintEditor();
  renderInspector();
}

function readTactic(): Tactic {
  const style = $<HTMLSelectElement>("#tactic-style").value;
  return {
    style: (style || "charge") as TacticStyle,
    power: Number($<HTMLInputElement>("#tactic-power").value),
    engage: Number($<HTMLInputElement>("#tactic-engage").value),
    retreatHp: Number($<HTMLInputElement>("#tactic-retreat").value),
    orbit: $<HTMLSelectElement>("#tactic-orbit").value === "orbitRight" ? "orbitRight" : "orbitLeft",
  };
}

function showTactic(): void {
  const tactic = app.tactic ?? DEFAULT_TACTIC;
  $<HTMLSelectElement>("#tactic-style").value = app.tactic ? tactic.style : "";
  $<HTMLInputElement>("#tactic-power").value = String(tactic.power);
  $<HTMLInputElement>("#tactic-engage").value = String(tactic.engage);
  $<HTMLInputElement>("#tactic-retreat").value = String(tactic.retreatHp);
  $<HTMLSelectElement>("#tactic-orbit").value = tactic.orbit;
  text("#power-out", String(tactic.power));
  text("#engage-out", String(tactic.engage));
  text("#retreat-out", String(tactic.retreatHp));
  $<HTMLInputElement>("#bot-name").value = app.definition.name;
}

function applyTactic(): void {
  const style = $<HTMLSelectElement>("#tactic-style").value;
  text("#power-out", $<HTMLInputElement>("#tactic-power").value);
  text("#engage-out", $<HTMLInputElement>("#tactic-engage").value);
  text("#retreat-out", $<HTMLInputElement>("#tactic-retreat").value);
  if (!style) { app.tactic = null; delete app.meta.tactics[app.draftId]; saveMeta(app.meta); renderInspector(); return; }
  app.tactic = readTactic();
  app.meta.tactics[app.draftId] = app.tactic;
  app.definition.brain = tacticBrain(app.tactic);
  saveMeta(app.meta);
  showTactic();
  commit();
  renderInspector();
}

function show(page: Page): void {
  app.page = page;
  for (const name of ["editor", "inspector", "queue", "replay"] as const) {
    $<HTMLElement>(`#${name}`).hidden = name !== page;
    const tab = document.querySelector<HTMLButtonElement>(`[data-page="${name}"]`);
    if (tab) tab.setAttribute("aria-current", name === page ? "page" : "false");
  }
  if (page === "replay" && app.replay) drawFrame();
  if (page === "inspector") renderInspector();
  if (page === "queue") {
    renderQueue();
    void refreshOfficialQueue();
    scheduleOfficialPolling();
  }
}

function renderInspector(): void {
  const shape = app.shape;
  const counts = shape?.counts;
  text("#counts", counts ? `Búa ${counts.hammer} · Kéo ${counts.scissor} · Bao ${counts.paper} · Motor ${counts.motor} · Tổng ${counts.total}` : "Chưa đọc được hình.");
  const motors = shape?.motors;
  text("#motors", motors ? `Motor: trái ${motors.left}, giữa ${motors.center}, phải ${motors.right}. Mũi ${motors.nose}, đuôi ${motors.tail}, thân ${motors.mid}.` : "");
  text("#size", shape ? `Khung ${(shape.bounds.width / RULESET.scale).toFixed(2)} × ${(shape.bounds.height / RULESET.scale).toFixed(2)} đơn vị. Lõi: ${shape.coreId || "chưa có"}.` : "");
  text("#brain-info", `Brain API ${app.definition.brain.apiVersion}. ${app.tactic ? "Chiến thuật mẫu đang gắn với bản này." : "Chiến thuật tùy chỉnh."} Ruleset ${RULESET.version}.`);
  text("#hash", app.package ? `Gói đã kiểm tra: ${app.package.packageHash}` : "Chưa có gói đã kiểm tra cho đúng bản đang mở.");
  const versions = $("#versions");
  versions.replaceChildren();
  if (app.cloudUser) for (const version of app.cloudVersions) {
    const li = document.createElement("li");
    li.className = "p-2 rounded-lg bg-slate-50 border border-slate-100";
    li.textContent = `Bản ${version.revision} · ${version.packageHash.slice(0, 12)}`;
    versions.append(li);
  }
  else for (const version of app.store.versions.filter(item => item.ownerId === owner())) {
    const li = document.createElement("li");
    li.className = "p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between";
    li.innerHTML = `
      <span class="font-bold text-slate-800">${version.package.definition.name}</span>
      <span class="text-slate-500">bản ${version.revision} · ${version.package.packageHash.slice(0, 12)}</span>
    `;
    versions.append(li);
  }
  if (!versions.childElementCount) versions.append(item("Chưa có phiên bản nào đạt kiểm tra.", ""));
  const drafts = $("#drafts");
  drafts.replaceChildren();
  if (app.cloudUser) for (const bot of app.cloudBots) {
    const btn = button(`${bot.bot.name} · sửa lần ${bot.revision}${bot.botId === app.cloudBotId ? " · đang mở" : ""}`, () => void openCloudBot(bot.botId).catch(error => toast(error instanceof Error ? error.message : "Không mở được bot.")));
    btn.className = "w-full text-left p-2.5 rounded-xl border bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700";
    drafts.append(btn);
  }
  else for (const draft of app.store.drafts.filter(item => item.ownerId === owner())) {
    const isActive = draft.id === app.draftId;
    const btn = button(`${draft.definition.name} · sửa lần ${draft.revision}${isActive ? " · đang mở" : ""}`, () => {
      useDraft(app.store, draft.id);
      remember();
      showTactic();
      paintEditor();
      void refreshInspect();
      show("editor");
    });
    btn.className = `w-full text-left p-2.5 rounded-xl border transition ${isActive ? "bg-rose-50/70 border-rose-200 text-rose-800 font-bold" : "bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700 font-medium"}`;
    drafts.append(btn);
  }
}

function renderQueue(): void {
  renderOfficialQueue();
  const list = $("#queue-list");
  list.replaceChildren();
  const rows = [...app.store.queue].sort((a, b) => a.order - b.order);
  for (const entry of rows) {
    const isWaiting = entry.status === "waiting";
    const isRunning = entry.status === "running";
    const state = isWaiting ? "đang chờ" : isRunning ? "đang chạy" : "đã xong";
    const stateBadge = isWaiting ? "bg-amber-50 text-amber-700 border-amber-200" : isRunning ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200";
    const row = document.createElement("li");
    row.className = "p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between";
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="font-bold text-slate-400">#${entry.order}</span>
        <span class="font-bold text-slate-900">${entry.package.definition.name}</span>
        <span class="text-slate-400 text-xs">(${entry.ownerId})</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] px-2 py-0.5 rounded-full border font-semibold ${stateBadge}">${state}</span>
        <span class="text-[10px] font-mono text-slate-400">${entry.package.packageHash.slice(0, 10)}</span>
      </div>
    `;
    list.append(row);
  }
  if (!rows.length) list.append(item("Hàng thử trên thiết bị này đang trống.", ""));
  const samples = $("#samples");
  samples.replaceChildren();
  for (const bot of app.references) {
    const btn = button(`+ ${bot.name}`, () => void enqueueSample(bot));
    btn.className = "px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200/80 transition";
    samples.append(btn);
  }
}

async function enqueueSample(bot: ReferenceBot): Promise<void> {
  const result = await enqueueOpponent(app.store, { id: freshId("q"), ownerId: `mau-${bot.id}`, package: bot.package });
  if (!result.ok) { toast(result.code === "ALREADY_QUEUED" ? `${bot.name} đang có lượt trong hàng.` : result.message); return; }
  app.store = result.store;
  remember();
  renderQueue();
  await maybeMatch();
}

async function submitCurrent(): Promise<void> {
  if (!commit()) return;
  if (!app.package || canonicalJson(app.package.definition) !== canonicalJson(app.definition)) {
    toast("Hãy kiểm tra và đạt trên đúng hình đang sửa trước khi nộp.");
    return;
  }
  const result = submitOwn(app.store, { id: freshId("q"), ownerId: owner(), packageHash: app.package.packageHash });
  if (!result.ok) { toast(result.code === "ALREADY_QUEUED" ? "Bạn đang có một lượt chờ hoặc trận đang chạy." : "Chỉ nộp được bản đã kiểm tra."); return; }
  app.store = result.store;
  remember();
  toast("Đã vào hàng thử trên máy này. Trận ở đây không phải trận chính thức.");
  renderQueue();
  await maybeMatch();
}

async function maybeMatch(): Promise<void> {
  const paired = takePair(app.store);
  if (!paired.pair) { renderQueue(); return; }
  app.store = paired.store;
  remember();
  renderQueue();
  const seed = matchSeed(paired.pair.a.package.packageHash, paired.pair.b.package.packageHash);
  try {
    const result = await simulateRequest(paired.pair.a.package, paired.pair.b.package, seed, "test");
    const replayId = result.replay.manifest.replayId;
    const done = finishPair(app.store, paired.pair.a.id, paired.pair.b.id, replayId);
    if (done.ok) { app.store = done.store; remember(); }
    await openReplay(result, `${paired.pair.a.package.definition.name} với ${paired.pair.b.package.definition.name}`, seed, "test");
  } catch (error) {
    const released = releasePair(app.store, paired.pair.a.id, paired.pair.b.id);
    if (released.ok) { app.store = released.store; remember(); }
    toast(error instanceof Error ? error.message : "Trận trong hàng không chạy được. Hai lượt đã trở lại hàng chờ.");
    renderQueue();
  }
}

async function openReplay(result: { replay: SavedReplay["replay"]; shapes: SavedReplay["shapes"] }, title: string, seed: number, mode: "test" | "official"): Promise<void> {
  const record: SavedReplay = { id: result.replay.manifest.replayId, created: Date.now(), title, seed, mode, replay: result.replay, shapes: result.shapes };
  app.replay = record;
  app.tick = 0;
  app.alpha = 0;
  app.playing = true;
  app.sought = -1;
  const headerSeed = document.querySelector("#header-seed-val");
  if (headerSeed) headerSeed.textContent = `#${seed}`;
  try { await saveReplay(record); app.replays = await listReplays(); } catch { app.replays = [record, ...app.replays].slice(0, 8); }
  renderReplayList();
  show("replay");
}

function renderReplayList(): void {
  const list = $("#replay-list");
  list.replaceChildren();
  for (const record of app.replays) {
    const btn = button(`${record.title} · seed ${record.seed}`, () => void openStored(record.id));
    btn.className = "px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold shrink-0 transition border border-slate-200/80";
    list.append(btn);
  }
  if (!app.replays.length) {
    const empty = document.createElement("span");
    empty.className = "text-xs text-slate-400";
    empty.textContent = "Chưa có trận nào được lưu trên máy.";
    list.append(empty);
  }
}

async function openStored(id: string): Promise<void> {
  const record = await loadReplay(id);
  if (!record) { toast("Không mở lại được trận này."); return; }
  app.replay = record;
  app.tick = 0;
  app.alpha = 0;
  app.playing = false;
  app.sought = -1;
  show("replay");
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function renderHud(team: "A" | "B", name: string, core: { hp: number; maxHp: number } | undefined, alive: number, total: number, load: number, motorsAlive: number, motorsTotal: number): void {
  const container = document.querySelector<HTMLElement>(`#hud-${team.toLowerCase()}`);
  if (!container) return;
  const isA = team === "A";
  const coreRatio = core && core.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((core.hp / core.maxHp) * 100))) : 0;
  const hpText = core ? `${core.hp} / ${core.maxHp} HP` : "—";
  const badgeColor = isA ? "text-rose-600 bg-rose-50 border-rose-100" : "text-blue-600 bg-blue-50 border-blue-100";
  const barGradient = isA ? "from-rose-600 via-rose-500 to-amber-500" : "from-teal-500 via-blue-500 to-blue-700";
  const diamondColor = isA ? "bg-rose-600" : "bg-blue-600";
  const barAlign = isA ? "" : "ml-auto";

  container.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2 ${isA ? "" : "order-2"}">
        <span class="w-2.5 h-2.5 rounded-2xs ${diamondColor} rotate-45 shadow-2xs"></span>
        <span class="font-extrabold text-sm tracking-tight text-slate-900 truncate max-w-[170px]">BOT ${team} · ${name}</span>
      </div>
      <span class="font-mono text-xs font-bold ${badgeColor} px-2 py-0.5 rounded border ${isA ? "" : "order-1"}">${coreRatio}% LÕI</span>
    </div>
    <div class="space-y-1.5 mb-2.5">
      <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
        <div class="h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-200 ${barAlign}" style="width: ${coreRatio}%"></div>
      </div>
      <div class="flex justify-between items-center text-[10px] font-mono text-slate-500 ${isA ? "" : "flex-row-reverse"}">
        <span>KẾT CẤU LÕI</span>
        <span class="font-semibold text-slate-700">${hpText}</span>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 font-mono text-[10.5px]">
      <div class="flex flex-col items-center px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200/60">
        <span class="text-[9px] text-slate-400">MẢNH</span>
        <span class="font-bold text-slate-800">${alive}<span class="text-slate-400 font-normal">/${total}</span></span>
      </div>
      <div class="flex flex-col items-center px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200/60">
        <span class="text-[9px] text-slate-400">MOTOR</span>
        <span class="font-bold ${isA ? "text-rose-600" : "text-blue-600"}">${motorsAlive}<span class="text-slate-400 font-normal">/${motorsTotal}</span></span>
      </div>
      <div class="flex flex-col items-center px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200/60">
        <span class="text-[9px] text-slate-400">TẢI</span>
        <span class="font-bold text-slate-700">${(load / 1000).toFixed(2)}</span>
      </div>
    </div>
  `;
}

function renderEventItem(event: VfxEvent): HTMLLIElement {
  const row = document.createElement("li");
  const time = formatTime(event.tick / RULESET.match.tickRate);
  if (event.kind === "hit" && event.advantage === "adv") {
    row.className = "p-1.5 rounded-lg bg-rose-50 border border-rose-100 flex items-start gap-1.5";
    row.innerHTML = `
      <span class="text-rose-500 font-bold shrink-0 text-[10px] mt-0.5">${time}</span>
      <div class="flex-1">
        <div class="flex items-center gap-1.5 text-rose-800 font-bold">
          <span class="px-1 py-0.2 bg-rose-600 text-white rounded text-[9px]">CRIT</span>
          <span>Khắc chế (${event.damage} HP)</span>
        </div>
        <div class="flex justify-between items-center text-[9.5px] text-rose-600 font-semibold mt-0.5">
          <span>Nhân đôi sát thương</span>
          <span class="font-mono">×2.0 EFFECT</span>
        </div>
      </div>
    `;
  } else if (event.kind === "motorLost") {
    row.className = "p-1.5 rounded-lg bg-amber-50/80 border border-amber-200 flex items-start gap-1.5";
    row.innerHTML = `
      <span class="text-amber-600 font-bold shrink-0 text-[10px] mt-0.5">${time}</span>
      <div class="flex-1">
        <div class="flex items-center gap-1 text-amber-900 font-bold">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>Hỏng cụm Motor</span>
        </div>
        <span class="text-[9.5px] text-amber-700">${event.team} mất motor phía ${event.side === "left" ? "trái" : event.side === "right" ? "phải" : "giữa"}</span>
      </div>
    `;
  } else if (event.kind === "destroy" || event.kind === "detach") {
    row.className = "p-1.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-1.5";
    row.innerHTML = `
      <span class="text-slate-400 shrink-0 text-[10px] mt-0.5">${time}</span>
      <div class="flex-1 text-slate-800">
        <div class="flex items-center gap-1 font-semibold text-[10.5px]">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>${captionEvent(event)}</span>
        </div>
      </div>
    `;
  } else if (event.kind === "coreHit" || event.kind === "coreDestroyed") {
    row.className = "p-1.5 rounded-lg bg-rose-50/80 border border-rose-200 flex items-start gap-1.5";
    row.innerHTML = `
      <span class="text-rose-600 font-bold shrink-0 text-[10px] mt-0.5">${time}</span>
      <div class="flex-1 text-rose-900">
        <div class="flex items-center gap-1 font-bold text-[10.5px]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#E11D48" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
          <span>${captionEvent(event)}</span>
        </div>
      </div>
    `;
  } else {
    row.className = "p-1.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-1.5";
    row.innerHTML = `
      <span class="text-slate-400 shrink-0 text-[10px] mt-0.5">${time}</span>
      <div class="flex-1 text-slate-700">
        <span class="text-[10.5px]">${captionEvent(event)}</span>
      </div>
    `;
  }
  return row;
}

function drawFrame(): void {
  const record = app.replay;
  const canvas = $<HTMLCanvasElement>("#replay-canvas");
  if (!record) return;
  const replay = record.replay;
  const total = replay.manifest.totalTicks;
  const tick = Math.max(0, Math.min(total, app.tick));
  if (app.sought !== tick || !app.checkpoint) { app.checkpoint = viewCheckpoint(replay, tick); app.sought = tick; }
  const nextTick = Math.min(total, tick + 1);
  const previous = replay.frames[tick];
  const next = replay.frames[nextTick];
  if (!previous || !next || !app.checkpoint) return;
  drawViewer(canvas, {
    previous, next, checkpoint: app.checkpoint, events: replay.events, alpha: nextTick === tick ? 0 : app.alpha,
    seed: replay.manifest.seed, bodies: record.shapes, frames: replay.frames, showDamage: app.showDamage, organic: app.organic,
  });
  const names = { A: replay.manifest.packages.A.definition.name, B: replay.manifest.packages.B.definition.name };
  for (const team of ["A", "B"] as const) {
    const bot = app.checkpoint.bots[team];
    const core = bot.triangles.find(triangle => record.shapes[team].find(shape => shape.id === triangle.id)?.core);
    const alive = bot.triangles.filter(triangle => triangle.alive).length;
    const motors = record.shapes[team].filter(s => s.type === "motor");
    const motorsAlive = bot.triangles.filter(t => t.alive && record.shapes[team].find(s => s.id === t.id)?.type === "motor").length;
    renderHud(team, names[team], core ? { hp: core.hp, maxHp: core.maxHp } : undefined, alive, bot.triangles.length, bot.loadFactor, motorsAlive, motors.length);
  }

  // Update left inspector panel stats during replay
  const shapesA = record.shapes.A;
  const botA = app.checkpoint.bots.A;
  const aliveA = botA.triangles.filter(t => t.alive).length;
  const coreA = botA.triangles.find(t => shapesA.find(s => s.id === t.id)?.core);
  const corePctA = coreA && coreA.maxHp > 0 ? Math.round((coreA.hp / coreA.maxHp) * 100) : 0;
  text("#stat-hammer", String(shapesA.filter(s => s.type === "hammer").length));
  text("#stat-scissor", String(shapesA.filter(s => s.type === "scissor").length));
  text("#stat-paper", String(shapesA.filter(s => s.type === "paper").length));
  text("#stat-motor", String(shapesA.filter(s => s.type === "motor").length));
  text("#stat-load", (botA.loadFactor / 1000).toFixed(2));
  text("#stat-pieces", `${aliveA}/${shapesA.length}`);
  text("#stat-core", `${corePctA}%`);

  // Update right damage heatmap panel
  const dmgA = app.checkpoint.bots.A.triangles.reduce((sum, t) => sum + t.damageReceived, 0);
  const dmgB = app.checkpoint.bots.B.triangles.reduce((sum, t) => sum + t.damageReceived, 0);
  const totalDmg = dmgA + dmgB;
  const pctA = totalDmg > 0 ? Math.round((dmgA / totalDmg) * 100) : 50;
  const pctB = totalDmg > 0 ? 100 - pctA : 50;
  text("#dmg-pct-a", `${pctA}% DMG`);
  text("#dmg-pct-b", `${pctB}% DMG`);
  text("#heatmap-updated", `CẬP NHẬT ${formatTime(tick / RULESET.match.tickRate)}`);

  const slider = $<HTMLInputElement>("#seek");
  slider.max = String(total);
  slider.value = String(tick);
  const end = replay.manifest.result;
  const outcome = tick === total ? (end.winner === "draw" ? "HÒA" : `${end.winner} THẮNG (${end.reason})`) : "";
  const timeSec = tick / RULESET.match.tickRate;
  const totalSec = total / RULESET.match.tickRate;
  $<HTMLElement>("#replay-status").innerHTML = `
    <div class="font-mono text-2xl font-black tracking-tight text-slate-900 leading-none">
      ${formatTime(timeSec)}
    </div>
    <div class="flex items-center gap-1.5 mt-1 text-[10.5px]">
      <span class="font-bold text-slate-600 uppercase tracking-wider">NHỊP ${tick}/${total}</span>
      ${outcome ? `<span class="text-slate-300">/</span><span class="font-semibold text-rose-600">${outcome}</span>` : `<span class="text-slate-300">/</span><span class="text-slate-400 font-mono">${formatTime(totalSec)}</span>`}
    </div>
  `;
  $("#play").textContent = app.playing ? "Tạm dừng" : "Phát";
  const log = $("#event-log");
  log.replaceChildren();
  for (const event of replay.events.filter(item => item.tick <= tick).slice(-6).reverse()) {
    log.append(renderEventItem(event));
  }
}

function step(by: number): void {
  if (!app.replay) return;
  app.playing = false;
  app.alpha = 0;
  app.tick = Math.max(0, Math.min(app.replay.replay.manifest.totalTicks, app.tick + by));
  drawFrame();
}

function loop(now: number): void {
  if (app.playing && app.replay && app.page === "replay") {
    const dt = app.lastTime ? Math.min(0.05, (now - app.lastTime) / 1000) : 0;
    app.alpha += dt * RULESET.match.tickRate * app.speed;
    const total = app.replay.replay.manifest.totalTicks;
    while (app.alpha >= 1 && app.tick < total) { app.alpha -= 1; app.tick += 1; }
    if (app.tick >= total) { app.tick = total; app.alpha = 0; app.playing = false; }
    drawFrame();
  }
  app.lastTime = now;
  requestAnimationFrame(loop);
}

function pendingStorageKey(userId: string): string { return `${PENDING_SUBMIT_PREFIX}${userId}`; }

function readPendingSubmission(userId: string): PendingSubmission | null {
  try {
    const value = JSON.parse(localStorage.getItem(pendingStorageKey(userId)) ?? "") as PendingSubmission;
    if (value.userId === userId && /^[A-Za-z0-9._~-]{8,128}$/.test(value.key) && value.botId && Number.isInteger(value.revision)) return value;
  } catch { /* no pending request is normal */ }
  return null;
}

function clearPendingSubmission(): void {
  if (app.pendingSubmission) localStorage.removeItem(pendingStorageKey(app.pendingSubmission.userId));
  app.pendingSubmission = null;
}

function localizeOfficialError(error: unknown): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (status === 401) return "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử tiếp.";
    if (status === 403 || status === 404) return "Không tìm thấy lượt trong tài khoản này.";
    if (status === 409) return "Tài khoản đang có lượt official khác hoặc yêu cầu bị trùng. Tải lại danh sách để xem trạng thái.";
    if (status === 422) return "Bot chưa đạt kiểm tra. Mở bot, sửa lỗi rồi kiểm tra lại trước khi nộp.";
    if (status >= 500) return "Máy chủ đang gặp lỗi. Thử tải lại; yêu cầu nộp sẽ giữ nguyên mã để không tạo lượt trùng.";
  }
  return error instanceof TypeError
    ? "Mất kết nối với máy chủ. Bạn có thể thử lại; yêu cầu sẽ dùng cùng mã để tránh nộp trùng."
    : error instanceof Error ? error.message : "Không tải được trạng thái official.";
}

function submissionId(entry: CloudSubmission): string {
  return entry.submissionId || (entry as CloudSubmission & { id?: string }).id || "";
}

function formatSubmissionDate(value: number | string): string {
  const number = typeof value === "string" ? Number(value) : value;
  const date = Number.isFinite(number) ? new Date(number) : new Date(value);
  return Number.isNaN(date.getTime()) ? "thời điểm không rõ" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function officialResultLabel(result?: CloudSubmission["result"]): string {
  if (!result) return "";
  const winner = result.winner === "draw" ? "Hòa" : `Đội ${result.winner} thắng`;
  const reason: Record<string, string> = { core: "phá lõi", incap: "mất khả năng chiến đấu", timeout: "hết giờ", brainBudget: "hết ngân sách chiến thuật" };
  return `${winner} · ${reason[result.reason] ?? result.reason}`;
}

function renderOfficialQueue(): void {
  const list = $("#official-list");
  list.replaceChildren();
  const hint = $("#official-status");
  if (!app.cloudUser) {
    hint.textContent = "Đăng nhập Google để xem và nộp lượt official trên tài khoản. Hàng local bên dưới chỉ là thử trên thiết bị này.";
    list.append(item("Chưa đăng nhập tài khoản.", ""));
    return;
  }
  if (app.pendingSubmission) {
    hint.textContent = `Đang xác nhận yêu cầu nộp bot ${app.pendingSubmission.botId}, bản ${app.pendingSubmission.revision}. Bấm nút nộp để gửi lại an toàn nếu mất mạng.`;
  } else if (app.officialQueueMessage) hint.textContent = app.officialQueueMessage;
  else hint.textContent = "Lượt official được lưu trên VPS và gắn với tài khoản Google này.";
  if (app.officialQueueLoading && !app.cloudSubmissions.length) {
    list.append(item("Đang tải trạng thái official…", ""));
    return;
  }
  for (const entry of app.cloudSubmissions) {
    const id = submissionId(entry);
    const row = document.createElement("li");
    row.className = "p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2";
    const heading = document.createElement("div");
    heading.className = "flex flex-wrap items-center justify-between gap-2";
    const title = document.createElement("strong");
    title.className = "text-slate-900";
    title.textContent = SUBMISSION_LABEL[entry.status] ?? `Trạng thái: ${entry.status}`;
    const badge = document.createElement("span");
    const badgeStyle = entry.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : entry.status === "failed" ? "bg-rose-50 text-rose-700 border-rose-200"
        : entry.status === "cancelled" ? "bg-slate-100 text-slate-600 border-slate-200"
          : "bg-amber-50 text-amber-700 border-amber-200";
    badge.className = `text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badgeStyle}`;
    badge.textContent = entry.status.toUpperCase();
    heading.append(title, badge);
    const details = document.createElement("p");
    details.className = "text-[11px] text-slate-500 break-all";
    details.textContent = `Nộp ${formatSubmissionDate(entry.createdAt)} · ID ${id || "không rõ"}${entry.position ? ` · vị trí ${entry.position}` : ""}${entry.matchId ? ` · trận ${entry.matchId}` : ""}`;
    row.append(heading, details);
    const result = officialResultLabel(entry.result);
    if (result) {
      const summary = document.createElement("p");
      summary.className = "text-xs font-semibold text-slate-800";
      summary.textContent = result;
      row.append(summary);
    }
    if (entry.errorMessage) {
      const error = document.createElement("p");
      error.className = "text-xs text-rose-700";
      error.textContent = entry.errorMessage;
      row.append(error);
    } else if (entry.errorCode) {
      const error = document.createElement("p");
      error.className = "text-xs text-rose-700";
      error.textContent = `Mã lỗi ${entry.errorCode}. Có thể nộp lượt mới sau khi trạng thái này kết thúc.`;
      row.append(error);
    }
    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-2 pt-1";
    if (entry.matchId) {
      let matchDetails: HTMLElement | null = null;
      const detail = button("Chi tiết trận", () => {
        if (matchDetails) { matchDetails.remove(); matchDetails = null; return; }
        matchDetails = document.createElement("p");
        matchDetails.className = "basis-full text-[11px] text-slate-600 break-all";
        matchDetails.textContent = "Đang tải chi tiết trận official…";
        row.append(matchDetails);
        void getCloudMatch(entry.matchId!).then(match => {
          if (!matchDetails?.isConnected) return;
          const result = officialResultLabel(match.result);
          matchDetails.textContent = `Seed ${match.seed} · engine ${match.engineVersion} · luật ${match.rulesetVersion}${result ? ` · ${result}` : ""} · hash A ${match.packageHashes.A.slice(0, 12)} · hash B ${match.packageHashes.B.slice(0, 12)}`;
        }).catch(error => {
          if (matchDetails?.isConnected) matchDetails.textContent = localizeOfficialError(error);
        });
      });
      detail.className = "min-h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200";
      actions.append(detail);
    }
    if (entry.status === "queued" && id) {
      const cancel = button("Hủy lượt đang chờ", () => void cancelOfficialSubmission(id));
      cancel.className = "min-h-9 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200";
      actions.append(cancel);
    }
    if (entry.status === "completed") {
      const replay = button("Xem replay", () => void openOfficialReplay(entry));
      replay.className = "min-h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold";
      actions.append(replay);
      if (entry.replayId || entry.matchId || entry.replayUrl) {
        const share = button("Chia sẻ replay 24 giờ", () => void shareOfficialReplay(entry));
        share.className = "min-h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200";
        actions.append(share);
      }
    }
    if (actions.childElementCount) row.append(actions);
    list.append(row);
  }
  if (!app.cloudSubmissions.length) list.append(item("Tài khoản này chưa có lượt official nào.", ""));
}

async function refreshOfficialQueue(): Promise<void> {
  if (!app.cloudUser || officialPollBusy) return;
  officialPollBusy = true;
  app.officialQueueLoading = true;
  renderOfficialQueue();
  try {
    const result = await listCloudSubmissions(0, 50);
    app.cloudSubmissions = result.items;
    app.officialQueueMessage = "";
    officialPollFailures = 0;
  } catch (error) {
    app.officialQueueMessage = localizeOfficialError(error);
    officialPollFailures = Math.min(officialPollFailures + 1, 4);
  } finally {
    app.officialQueueLoading = false;
    officialPollBusy = false;
    renderOfficialQueue();
    scheduleOfficialPolling();
  }
}

function scheduleOfficialPolling(): void {
  window.clearInterval(officialPollTimer);
  officialPollTimer = window.setInterval(() => {
    if (app.page === "queue" && document.visibilityState === "visible") void refreshOfficialQueue();
  }, Math.min(15000, 2500 * (2 ** officialPollFailures)));
}

async function transmitPendingSubmission(): Promise<void> {
  const pending = app.pendingSubmission;
  if (!app.cloudUser || !pending || pending.userId !== app.cloudUser.id) return;
  try {
    const result = await submitCloudBot(pending.botId, pending.revision, pending.key);
    clearPendingSubmission();
    const existing = app.cloudSubmissions.filter(item => submissionId(item) !== result.submissionId);
    app.cloudSubmissions = [result, ...existing].slice(0, 50);
    app.officialQueueMessage = "";
    toast(`Đã nhận lượt official ${result.submissionId}.`);
    renderQueue();
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && Number((error as { status: unknown }).status) >= 400 && Number((error as { status: unknown }).status) < 500 && Number((error as { status: unknown }).status) !== 401) {
      clearPendingSubmission();
    }
    app.officialQueueMessage = localizeOfficialError(error);
    await refreshOfficialQueue();
    renderQueue();
    toast(localizeOfficialError(error));
  }
}

async function submitOfficialCurrent(): Promise<void> {
  if (!app.cloudUser) { toast("Đăng nhập Google trước khi nộp lượt official."); return; }
  if (app.pendingSubmission) { await transmitPendingSubmission(); return; }
  if (!commit() || !(await saveCloud())) return;
  if (!app.cloudBotId) { toast("Hãy lưu bot lên tài khoản trước khi nộp."); return; }
  try {
    const saved = await getCloudBot(app.cloudBotId);
    if (saved.revision !== app.cloudRevision || canonicalJson(saved.bot) !== canonicalJson(app.definition)) {
      toast("Bot đã đổi ở thẻ hoặc máy khác. Tải lại bản trên tài khoản, kiểm tra rồi nộp lại.");
      return;
    }
    const validation = await validateCloudBot(app.cloudBotId);
    if (!validation.report.valid || !validation.package) {
      app.package = null;
      app.report = validation.report;
      renderIssues(validation.report.errors, validation.report.warnings);
      toast("Bot chưa đạt kiểm tra. Sửa các lỗi rồi kiểm tra lại trước khi nộp.");
      return;
    }
    app.package = validation.package;
    app.cloudVersions = (await getCloudBot(app.cloudBotId)).versions;
    const pending: PendingSubmission = { key: `sub_${crypto.randomUUID()}`, botId: app.cloudBotId, revision: app.cloudRevision, userId: app.cloudUser.id };
    localStorage.setItem(pendingStorageKey(pending.userId), JSON.stringify(pending));
    app.pendingSubmission = pending;
    renderOfficialQueue();
    await transmitPendingSubmission();
  } catch (error) {
    toast(localizeOfficialError(error));
  }
}

async function cancelOfficialSubmission(id: string): Promise<void> {
  try {
    await cancelCloudSubmission(id);
    toast("Đã hủy lượt official đang chờ.");
    await refreshOfficialQueue();
  } catch (error) {
    toast(localizeOfficialError(error));
    await refreshOfficialQueue();
  }
}

async function officialReplayId(entry: CloudSubmission): Promise<string> {
  if (entry.replayId) return entry.replayId;
  if (entry.matchId) return (await getCloudMatch(entry.matchId)).replayId || entry.matchId;
  const fromUrl = entry.replayUrl?.match(/\/replays\/([^/?#]+)/)?.[1];
  if (fromUrl) return decodeURIComponent(fromUrl);
  throw new Error("Trận đã xong nhưng chưa có mã replay. Tải lại hàng chờ rồi thử lại.");
}

async function loadOfficialReplay(entry: CloudSubmission): Promise<{ replay: SavedReplay["replay"]; shapes: SavedReplay["shapes"]; seed: number; title: string; replayId: string }> {
  const replayId = await officialReplayId(entry);
  if (!replayId) throw new Error("Trận đã xong nhưng chưa có mã replay. Tải lại hàng chờ rồi thử lại.");
  const saved = await getCloudReplay(replayId);
  const packages = saved.replay.manifest.packages;
  const [left, right] = await Promise.all([inspectBot(packages.A.definition), inspectBot(packages.B.definition)]);
  if (!left.shape || !right.shape) throw new Error("Không dựng được hình của replay official.");
  const title = `${packages.A.definition.name} với ${packages.B.definition.name}`;
  return { replay: saved.replay, shapes: { A: left.shape.triangles, B: right.shape.triangles }, seed: saved.replay.manifest.seed, title, replayId };
}

async function openOfficialReplay(entry: CloudSubmission): Promise<void> {
  try {
    const loaded = await loadOfficialReplay(entry);
    await openReplay(loaded, loaded.title, loaded.seed, "official");
  } catch (error) { toast(localizeOfficialError(error)); }
}

async function shareOfficialReplay(entry: CloudSubmission): Promise<void> {
  try {
    const response = await createCloudReplayShare(await officialReplayId(entry));
    const url = response.shareUrl || response.url;
    if (!url) throw new Error("Máy chủ chưa trả đường dẫn chia sẻ.");
    try {
      await navigator.clipboard.writeText(url);
      toast("Đã sao chép link replay, link dùng được 24 giờ.");
    } catch {
      window.prompt("Sao chép link replay (hết hạn sau 24 giờ):", url);
    }
  } catch (error) { toast(localizeOfficialError(error)); }
}

async function refreshCloudBots(): Promise<void> {
  if (!app.cloudUser) return;
  const bots: CloudBot[] = [];
  let cursor: number | null = 0;
  while (cursor !== null) {
    const page = await listCloudBots(cursor);
    bots.push(...page.bots);
    cursor = page.nextCursor;
  }
  app.cloudBots = bots;
  if (!app.cloudBotId && bots[0]) await openCloudBot(bots[0].botId);
  renderInspector();
}

async function openCloudBot(id: string): Promise<void> {
  if (app.cloudBotId && canonicalJson(app.definition) !== app.cloudSaved && !confirm("Bot đang mở có thay đổi chưa lưu. Bỏ thay đổi và mở bot khác?")) return;
  const saved = await getCloudBot(id);
  app.cloudBotId = id;
  app.cloudRevision = saved.revision;
  app.cloudSaved = canonicalJson(saved.bot);
  app.cloudVersions = saved.versions;
  app.definition = structuredClone(saved.bot);
  app.tactic = null;
  app.report = null;
  app.package = null;
  showTactic();
  paintEditor();
  renderInspector();
  await refreshInspect();
}

async function saveCloud(): Promise<boolean> {
  if (!app.cloudUser || !commit()) return false;
  const json = canonicalJson(app.definition);
  if (app.cloudBotId && json === app.cloudSaved) return true;
  try {
    const result = app.cloudBotId
      ? await editCloudBot(app.cloudBotId, app.cloudRevision, app.definition)
      : await createCloudBot(app.definition);
    app.cloudBotId = result.botId;
    app.cloudRevision = result.revision;
    app.cloudSaved = json;
    await refreshCloudBots();
    toast("Đã lưu bot lên tài khoản.");
    return true;
  } catch (error) {
    toast(error instanceof Error && error.message.includes("Revision conflict")
      ? "Bot đã được sửa ở thẻ hoặc máy khác. Mở lại bản trên máy chủ trước khi lưu tiếp."
      : error instanceof Error ? error.message : "Không lưu được bot.");
    return false;
  }
}

async function importLocalDrafts(): Promise<void> {
  if (!app.cloudUser) return;
  const drafts = app.store.drafts.filter(draft => draft.ownerId === owner());
  const existing = new Set(app.cloudBots.map(item => canonicalJson(item.bot)));
  const fresh = drafts.filter(draft => {
    const json = canonicalJson(draft.definition);
    if (existing.has(json)) return false;
    existing.add(json);
    return true;
  });
  if (!fresh.length) { toast("Không có bản nháp mới để nhập."); return; }
  const preview = fresh.slice(0, 10).map(draft => `• ${draft.definition.name}`).join("\n");
  if (!confirm(`Nhập ${fresh.length} bản nháp từ máy này lên tài khoản?\n${preview}${fresh.length > 10 ? "\n…" : ""}\nBot trùng nội dung sẽ được bỏ qua; không ghi đè bot đã có.`)) return;
  try {
    for (const draft of fresh) await createCloudBot(draft.definition);
    await refreshCloudBots();
    toast(`Đã nhập ${fresh.length} bot.`);
  } catch (error) {
    await refreshCloudBots().catch(() => {});
    toast(error instanceof Error ? error.message : "Nhập bot thất bại.");
  }
}

function renderAccount(): void {
  const signedIn = Boolean(app.cloudUser);
  text("#account-status", signedIn ? `${app.cloudUser?.displayName} · lưu trên tài khoản` : "Phòng thử trên máy này");
  $<HTMLElement>("#google-signin").hidden = signedIn;
  for (const id of ["#save-cloud", "#import-local", "#logout"]) $<HTMLElement>(id).hidden = !signedIn;
  $<HTMLElement>("#admin-link").hidden = app.cloudUser?.role !== "admin";
  $<HTMLAnchorElement>("#admin-link").href = `${apiOrigin()}/admin`;
  $<HTMLInputElement>("#player").disabled = signedIn;
  if (signedIn) $<HTMLInputElement>("#player").value = app.cloudUser?.displayName ?? "";
  $<HTMLButtonElement>("#official-submit").textContent = signedIn ? "Nộp lượt official" : "Đăng nhập để nộp official";
}

async function setupAccount(): Promise<void> {
  try { app.cloudUser = (await authMe()).user; }
  catch { /* no session */ }
  if (app.cloudUser) {
    app.cloudBotId = null;
    app.definition = starterDefinition();
    app.package = null;
    app.pendingSubmission = readPendingSubmission(app.cloudUser.id);
    renderAccount();
    try { await refreshCloudBots(); }
    catch (error) { toast(error instanceof Error ? error.message : "Không tải được bot từ tài khoản."); }
    return;
  }
  renderAccount();
  try {
    const { clientId } = await googleConfig();
    if (!clientId) { text("#account-status", "Google Sign-In chưa được cấu hình."); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.head.append(script);
    await new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = () => reject(new Error("Không tải được Google Sign-In.")); });
    const google = (globalThis as typeof globalThis & { google: { accounts: { id: { initialize(options: unknown): void; renderButton(element: HTMLElement, options: unknown): void } } } }).google;
    google.accounts.id.initialize({ client_id: clientId, use_fedcm_for_button: true, callback: async ({ credential }: { credential: string }) => {
      try {
        await googleLogin(credential);
        try { await authMe(); }
        catch { throw new Error("Trình duyệt không giữ được phiên đăng nhập. Hãy thử trình duyệt thường hoặc cho phép đăng nhập Google."); }
        location.reload();
      }
      catch (error) { toast(error instanceof Error ? error.message : "Đăng nhập Google thất bại."); }
    } });
    google.accounts.id.renderButton($<HTMLElement>("#google-signin"), { theme: "outline", size: "medium", text: "continue_with" });
  } catch (error) { text("#account-status", error instanceof Error ? error.message : "Không thể đăng nhập Google."); }
}

function syncResponsivePanels(): void {
  const media = window.matchMedia("(max-width: 1199px)");
  const apply = (): void => {
    for (const panel of document.querySelectorAll<HTMLDetailsElement>("[data-responsive-panel]")) panel.open = !media.matches;
  };
  apply();
  media.addEventListener("change", apply);
}

function bind(): void {
  syncResponsivePanels();
  $("#save-cloud").addEventListener("click", () => void saveCloud());
  $("#import-local").addEventListener("click", () => void importLocalDrafts());
  $("#logout").addEventListener("click", () => void logout().then(() => location.reload()).catch(error => toast(error instanceof Error ? error.message : "Đăng xuất thất bại.")));
  $<HTMLInputElement>("#player").value = app.meta.playerName;
  $<HTMLInputElement>("#player").addEventListener("change", () => {
    const name = $<HTMLInputElement>("#player").value.trim() || "Bạn";
    const from = app.store.drafts.find(item => item.id === app.draftId)?.ownerId ?? owner();
    const renamed = renameOwner(app.store, from, ownerIdFromName(name));
    if (!renamed.ok) { toast("Tên này đã có trong trình duyệt."); $<HTMLInputElement>("#player").value = app.meta.playerName; return; }
    app.store = renamed.store;
    app.meta.playerName = name;
    remember();
    renderInspector();
    renderQueue();
  });
  for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-page]")) tab.addEventListener("click", () => show(tab.dataset.page as Page));
  for (const tool of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) tool.addEventListener("click", () => {
    app.tool = tool.dataset.tool as Tool;
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) button.setAttribute("aria-pressed", String(button === tool));
  });
  $<HTMLCanvasElement>("#editor-canvas").addEventListener("pointerdown", event => {
    const point = localPoint(event);
    if (!point) return;
    const cell = cellAt(point);
    if (cell) paintCell(cell);
  });
  $<HTMLInputElement>("#bot-name").addEventListener("change", () => {
    const name = $<HTMLInputElement>("#bot-name").value.trim();
    app.definition.name = name || "Bot mới";
    commit();
  });
  for (const id of ["#tactic-style", "#tactic-power", "#tactic-engage", "#tactic-retreat", "#tactic-orbit"]) $(id).addEventListener("input", applyTactic);
  document.querySelector("#editor form")?.addEventListener("submit", event => event.preventDefault());
  $("#validate").addEventListener("click", () => void validate());
  $("#simulate").addEventListener("click", () => void simulate());
  $("#reset").addEventListener("click", () => {
    const fresh = starterDefinition(app.definition.name);
    app.definition.body = fresh.body;
    app.definition.brain = fresh.brain;
    app.tactic = { ...DEFAULT_TACTIC };
    app.meta.tactics[app.draftId] = app.tactic;
    showTactic();
    commit();
    paintEditor();
  });
  $("#fresh").addEventListener("click", () => { createDraft(starterDefinition()); showTactic(); paintEditor(); void refreshInspect(); });
  $("#submit").addEventListener("click", () => void submitCurrent());
  $("#official-submit").addEventListener("click", () => void submitOfficialCurrent());
  $("#official-refresh").addEventListener("click", () => void refreshOfficialQueue());
  $("#match").addEventListener("click", () => void maybeMatch());
  $("#play").addEventListener("click", () => {
    if (!app.replay) return;
    if (app.tick >= app.replay.replay.manifest.totalTicks) { app.tick = 0; app.alpha = 0; }
    app.playing = !app.playing;
    app.lastTime = 0;
    drawFrame();
  });
  $("#back").addEventListener("click", () => step(-1));
  $("#forward").addEventListener("click", () => step(1));
  $<HTMLInputElement>("#seek").addEventListener("input", () => { app.playing = false; app.alpha = 0; app.tick = Number($<HTMLInputElement>("#seek").value); drawFrame(); });
  $<HTMLSelectElement>("#playback-speed").addEventListener("change", () => { app.speed = Number($<HTMLSelectElement>("#playback-speed").value); });
  $<HTMLInputElement>("#damage").addEventListener("change", () => { app.showDamage = $<HTMLInputElement>("#damage").checked; drawFrame(); });
  const replayHudToggle = $<HTMLButtonElement>("#replay-hud-toggle");
  const replayHud = [...document.querySelectorAll<HTMLElement>("[data-replay-hud]")];
  const setReplayHud = (visible: boolean): void => {
    for (const panel of replayHud) panel.hidden = !visible;
    replayHudToggle.setAttribute("aria-expanded", String(visible));
    replayHudToggle.textContent = visible ? "Ẩn HUD" : "Hiện HUD";
  };
  replayHudToggle.addEventListener("click", () => setReplayHud(replayHud.some(panel => panel.hidden)));
  setReplayHud(false);
  const jsonModal = $<HTMLElement>("#json-modal");
  const jsonArea = $<HTMLTextAreaElement>("#json-textarea");
  const jsonFileInput = $<HTMLInputElement>("#json-file-input");

  const hideModal = (): void => {
    jsonModal.hidden = true;
    jsonModal.style.display = "none";
  };

  const showModal = (): void => {
    jsonModal.hidden = false;
    jsonModal.style.display = "flex";
  };

  $("#import-json-btn").addEventListener("click", () => {
    jsonArea.value = "";
    showModal();
    jsonArea.focus();
  });

  $("#export-json-btn").addEventListener("click", () => {
    const text = JSON.stringify(app.definition, null, 2);
    jsonArea.value = text;
    showModal();
    navigator.clipboard?.writeText(text).then(() => {
      toast("Đã xuất JSON và sao chép vào bộ nhớ tạm.");
    }).catch(() => {
      toast("Đã mở cửa sổ xuất JSON.");
    });
  });

  $("#json-close-btn").addEventListener("click", hideModal);
  $("#json-cancel-btn").addEventListener("click", hideModal);

  $("#json-copy-btn").addEventListener("click", () => {
    const text = jsonArea.value;
    if (!text) { toast("Không có nội dung để sao chép."); return; }
    navigator.clipboard?.writeText(text).then(() => {
      toast("Đã sao chép vào bộ nhớ tạm.");
    }).catch(() => {
      toast("Vui lòng chọn và sao chép thủ công.");
    });
  });

  jsonFileInput.addEventListener("change", () => {
    const file = jsonFileInput.files?.[0];
    if (file) {
      file.text().then(content => {
        jsonArea.value = content;
        toast(`Đã tải tệp: ${file.name}`);
      }).catch(() => {
        toast("Không đọc được tệp JSON.");
      });
    }
  });

  $("#json-apply-btn").addEventListener("click", () => {
    const raw = jsonArea.value.trim();
    if (!raw) {
      toast("Vui lòng dán nội dung JSON hoặc chọn tệp.");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.body || !Array.isArray(parsed.body.triangles)) {
        toast("JSON không hợp lệ: thiếu cấu trúc body.triangles.");
        return;
      }
      if (!parsed.brain || !Array.isArray(parsed.brain.states)) {
        toast("JSON không hợp lệ: thiếu cấu trúc brain.states.");
        return;
      }
      createDraft(parsed as BotDefinition, null);
      showTactic();
      paintEditor();
      void refreshInspect();
      hideModal();
      show("editor");
      toast(`Đã nhập bot "${parsed.name || "Bot mới"}" thành công!`);
    } catch (err) {
      toast(err instanceof Error ? `Lỗi cú pháp JSON: ${err.message}` : "Lỗi đọc JSON.");
    }
  });

  jsonModal.addEventListener("click", event => {
    if (event.target === jsonModal) hideModal();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && (!jsonModal.hidden || jsonModal.style.display !== "none")) {
      hideModal();
      return;
    }
    if (app.page !== "replay" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === " ") { event.preventDefault(); $<HTMLButtonElement>("#play").click(); }
  });
}

async function validate(): Promise<void> {
  if (!commit()) return;
  text("#validate-summary", "Đang kiểm tra…");
  try {
    if (app.cloudUser && !(await saveCloud())) return;
    const result = app.cloudUser ? await validateCloudBot(app.cloudBotId!) : await validateRequest(app.definition);
    app.report = result.report;
    renderIssues(result.report.errors, result.report.warnings);
    if (!result.package || !result.report.valid) {
      app.package = null;
      text("#validate-summary", "Chưa đạt. Sửa các dòng phía trên rồi kiểm tra lại.");
      renderInspector();
      return;
    }
    if (app.cloudUser) app.cloudVersions = (await getCloudBot(app.cloudBotId!)).versions;
    else {
      const recorded = await recordVersion(app.store, { draftId: app.draftId, ownerId: owner(), expectedRevision: app.revision, package: result.package });
      if (!recorded.ok) { toast(recorded.message); return; }
      app.store = recorded.store;
      remember();
    }
    app.package = result.package;
    text("#validate-summary", "Đạt. Bản này đã lưu và có thể chạy thử hoặc nộp vào hàng.");
    renderInspector();
  } catch (error) {
    text("#validate-summary", error instanceof Error ? error.message : "Kiểm tra thất bại.");
  }
}

async function simulate(): Promise<void> {
  if (!commit()) return;
  if (app.cloudUser && !(await saveCloud())) return;
  if (!app.package || canonicalJson(app.package.definition) !== canonicalJson(app.definition)) {
    toast("Hãy kiểm tra và đạt trên đúng hình đang sửa trước khi chạy thử.");
    return;
  }
  const selected = $<HTMLSelectElement>("#opponent").value;
  const opponent = app.references.find(bot => bot.id === selected);
  if (!opponent) { toast("Chọn một bot để đấu."); return; }
  const seed = Number($<HTMLInputElement>("#seed").value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) { toast("Seed phải là số nguyên từ 0 đến 4294967295."); return; }
  text("#validate-summary", "Đang chạy trận…");
  try {
    let result;
    if (app.cloudUser) {
      const summary = await simulateCloudBot(app.cloudBotId!, opponent.id, seed);
      const saved = await getCloudReplay(summary.replayId);
      const definitions = saved.replay.manifest.packages;
      const [left, right] = await Promise.all([inspectBot(definitions.A.definition), inspectBot(definitions.B.definition)]);
      if (!left.shape || !right.shape) throw new Error("Không dựng được hình replay.");
      result = { replay: saved.replay, shapes: { A: left.shape.triangles, B: right.shape.triangles } };
    } else result = await simulateRequest(app.package, opponent.package, seed, "test");
    text("#validate-summary", "Đã có trận. Đang mở băng ghi.");
    await openReplay(result, `${app.definition.name} với ${opponent.name}`, seed, "test");
  } catch (error) {
    text("#validate-summary", error instanceof Error ? error.message : "Trận không chạy được.");
  }
}

async function boot(): Promise<void> {
  saveStore(app.store);
  ensureDraft();
  bind();
  showTactic();
  paintEditor();
  show("editor");
  try {
    app.references = (await referenceBots()).bots;
    const select = $<HTMLSelectElement>("#opponent");
    for (const bot of app.references) {
      const option = document.createElement("option");
      option.value = bot.id;
      option.textContent = bot.name;
      select.append(option);
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : "Không tải được bot mẫu.");
  }
  await setupAccount();
  if (app.cloudUser) {
    await refreshOfficialQueue();
    if (app.pendingSubmission) void transmitPendingSubmission();
  }
  scheduleOfficialPolling();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && app.page === "queue") {
      officialPollFailures = 0;
      void refreshOfficialQueue();
      scheduleOfficialPolling();
    }
  });
  app.replays = await listReplays().catch(() => []);
  renderReplayList();
  renderQueue();
  await refreshInspect();
  requestAnimationFrame(loop);
}

await boot();

if (new URLSearchParams(location.search).get("selftest") === "1") {
  const note = $("#selftest");
  try {
    paintEditor();
    const editor = $<HTMLCanvasElement>("#editor-canvas");
    const editorInk = countInk(editor, 0, 0, editor.width, editor.height);
    if (editorInk < 30) throw new Error("lưới vẽ trống");
    $<HTMLButtonElement>("#validate").click();
    await waitFor(() => /Đạt|Chưa đạt|thất bại/.test($("#validate-summary").textContent ?? ""));
    if (!$("#validate-summary").textContent?.includes("Đạt")) throw new Error($("#validate-summary").textContent ?? "validate trống");
    const bodies = fixtureBodies();
    const replay = fixtureReplay(bodies);
    app.replay = { id: "selftest", created: 0, title: "selftest", seed: 1, mode: "test", replay, shapes: bodies };
    app.tick = 0; app.alpha = 0; app.playing = false; app.sought = -1;
    show("replay");
    drawFrame();
    const viewer = $<HTMLCanvasElement>("#replay-canvas");
    if (countInk(viewer, 0, 0, viewer.width / 2, viewer.height) < 15) throw new Error("đội A không hiện trên sân");
    note.textContent = "SELFTEST PASS";
  } catch (error) {
    note.textContent = `SELFTEST FAIL ${error instanceof Error ? error.message : String(error)}`;
  }
}

function countInk(canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const pixels = ctx.getImageData(x, y, width, height).data;
  let ink = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index] ?? 255, green = pixels[index + 1] ?? 255, blue = pixels[index + 2] ?? 255;
    if (red < 248 || green < 248 || blue < 248) ink += 1;
  }
  return ink;
}

function waitFor(ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (ready()) resolve();
      else if (performance.now() - started > 90000) reject(new Error("hết thời gian chờ"));
      else window.setTimeout(tick, 200);
    };
    tick();
  });
}

function fixtureBodies(): Record<"A" | "B", DisplayTriangle[]> {
  const triangle = (id: string, type: TriType, core: boolean, ox: number, oy: number): DisplayTriangle => ({
    id, type, core, center: { x: ox, y: oy },
    vertices: [{ x: ox, y: oy + 400 }, { x: ox + 500, y: oy - 200 }, { x: ox - 500, y: oy - 200 }],
  });
  return {
    A: [triangle("core", "hammer", true, 0, 0), triangle("motor", "motor", false, 0, -700)],
    B: [triangle("core", "paper", true, 0, 0), triangle("motor", "motor", false, 0, -700)],
  };
}

function fixtureReplay(bodies: Record<"A" | "B", DisplayTriangle[]>): SavedReplay["replay"] {
  const bot = (x: number, heading: number) => ({
    position: { x, y: 20000 }, heading, loadFactor: 1000,
    triangles: [{ id: "core", hp: 70, maxHp: 70, alive: true, damageReceived: 0 }, { id: "motor", hp: 80, maxHp: 80, alive: true, damageReceived: 0 }],
  });
  const frame = (tick: number, ax: number) => ({
    tick,
    bots: {
      A: { position: { x: ax, y: 20000 }, heading: 0, loadFactor: 1000, changes: [] },
      B: { position: { x: 30000, y: 20000 }, heading: 32, loadFactor: 1000, changes: [] },
    },
  });
  const names = bodies.A[0] && bodies.B[0] ? { A: "A", B: "B" } : { A: "A", B: "B" };
  return {
    manifest: {
      replayId: "replay-selftest", replayVersion: "2.0.0", engineVersion: "0.1.1", rulesetVersion: RULESET.version,
      mode: "test", seed: 1, packages: {
        A: { packageHash: "0".repeat(64), versions: app.package?.versions ?? { engine: "0.1.1", ruleset: RULESET.version, botSchema: "1.0.0", brainApi: "1.0.0", replay: "2.0.0", mcpApi: "0.0.0" }, definition: { ...app.definition, name: names.A } },
        B: { packageHash: "0".repeat(64), versions: app.package?.versions ?? { engine: "0.1.1", ruleset: RULESET.version, botSchema: "1.0.0", brainApi: "1.0.0", replay: "2.0.0", mcpApi: "0.0.0" }, definition: { ...app.definition, name: names.B } },
      },
      tickRate: 30, totalTicks: 1, checkpointIntervalTicks: 30, dataHash: "0".repeat(64),
      result: { winner: "draw", reason: "timeout", tick: 1, scores: { A: 0, B: 0 } },
    },
    frames: [frame(0, 10000), frame(1, 11000)],
    checkpoints: [{ tick: 0, bots: { A: bot(10000, 0), B: bot(30000, 32) } }],
    events: [],
  };
}
