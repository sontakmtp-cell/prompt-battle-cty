import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectDefinition } from "@prompt-chien/application";
import { analyzeGeometry } from "@prompt-chien/core/geometry";
import { packBot } from "@prompt-chien/core/engine";
import { referenceBots } from "./reference-bots.mjs";
import { runIsolated } from "./run-isolated.mjs";
import { handlePage, send } from "./web-static.mjs";

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 2_000_000) { reject(new Error("Dữ liệu gửi lên quá lớn.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function shapeOf(definition) {
  const geometry = analyzeGeometry(definition.body);
  const counts = { hammer: 0, scissor: 0, paper: 0, motor: 0, total: geometry.triangles.length };
  const motors = { left: 0, center: 0, right: 0, nose: 0, tail: 0, mid: 0 };
  for (const triangle of geometry.triangles) {
    counts[triangle.type] += 1;
    if (triangle.type !== "motor") continue;
    motors[triangle.center.x < -800 ? "left" : triangle.center.x > 800 ? "right" : "center"] += 1;
    motors[triangle.center.y > 800 ? "nose" : triangle.center.y < -800 ? "tail" : "mid"] += 1;
  }
  return {
    ok: geometry.ok, counts, bounds: geometry.bounds, coreId: geometry.coreId, motors,
    triangles: geometry.triangles.map(triangle => ({ id: triangle.id, type: triangle.type, core: triangle.core, vertices: triangle.vertices, center: triangle.center })),
  };
}

let references;
function referencePackages() {
  references ??= Promise.all(Object.entries(referenceBots()).map(async ([id, definition]) => ({ id, name: definition.name, package: await packBot(definition) })));
  return references;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/references") {
      send(res, 200, JSON.stringify({ bots: await referencePackages() }));
      return;
    }
    if (req.method !== "POST") { send(res, 404, JSON.stringify({ error: "Không có đường dẫn này." })); return; }
    const input = JSON.parse(await readBody(req));
    if (url.pathname === "/api/inspect") {
      const inspection = inspectDefinition(input.bot);
      send(res, 200, JSON.stringify({ inspection, shape: inspection.schema === "passed" ? shapeOf(input.bot) : null }));
      return;
    }
    if (url.pathname === "/api/validate") {
      send(res, 200, JSON.stringify(await runIsolated({ kind: "validate", bot: input.bot })));
      return;
    }
    if (url.pathname === "/api/simulate") {
      if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295) throw new Error("Seed phải là số nguyên từ 0 đến 4294967295.");
      const result = await runIsolated({ kind: "simulate", a: input.a, b: input.b, seed: input.seed });
      if (input.mode === "official") result.replay.manifest.mode = "official";
      const shapes = {
        A: shapeOf(result.replay.manifest.packages.A.definition).triangles,
        B: shapeOf(result.replay.manifest.packages.B.definition).triangles,
      };
      send(res, 200, JSON.stringify({ replay: result.replay, shapes }));
      return;
    }
    send(res, 404, JSON.stringify({ error: "Không có đường dẫn này." }));
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error instanceof Error ? error.message : "Yêu cầu không chạy được." }));
  }
}

export function startLab(port = 4174) {
  const server = createServer((req, res) => {
    const address = server.address();
    const bound = address && typeof address === "object" ? address.port : port;
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${bound}`) { send(res, 403, JSON.stringify({ error: "Sai nguồn." })); return; }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${bound}`);
    if (url.pathname.startsWith("/api/")) { void handleApi(req, res, url); return; }
    if (!handlePage(res, url)) send(res, 404, "Not found", "text/plain; charset=utf-8");
  });
  return new Promise(resolveListen => server.listen(port, "127.0.0.1", () => resolveListen(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startLab(Number(process.env.PORT) || 4174);
  const address = server.address();
  console.log(`PROMPT CHIẾN lab: http://127.0.0.1:${address.port}`);
}
