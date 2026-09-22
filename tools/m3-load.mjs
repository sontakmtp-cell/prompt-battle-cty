import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const base = (process.env.M3_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const count = Number(process.env.M3_LOAD_REQUESTS ?? 10);
if (!Number.isSafeInteger(count) || count < 2 || count > 100) throw new Error("M3_LOAD_REQUESTS must be an integer from 2 to 100");
const botA = JSON.parse(await readFile(new URL("../examples/bots/spear.json", import.meta.url), "utf8"));
const botB = JSON.parse(await readFile(new URL("../examples/bots/shield.json", import.meta.url), "utf8"));

const timings = [];
const failures = [];
await Promise.all(Array.from({ length: count }, async (_, index) => {
  const started = performance.now();
  try {
    const response = await fetch(`${base}/api/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botA, botB, seed: 10_000 + index }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    const value = await response.json();
    if (!value.replay?.manifest?.dataHash) throw new Error("simulation response is incomplete");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    timings.push(performance.now() - started);
  }
}));

timings.sort((left, right) => left - right);
const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];
// ponytail: smoke-level local/Worker gate; replace with measured production SLO after hosted traffic exists.
if (failures.length || p95 > 10_000) throw new Error(`M3 LOAD FAILED: ${failures.length} failures, p95=${p95.toFixed(1)}ms`);
console.log(`M3 LOAD PASSED: ${count} concurrent simulations, p95=${p95.toFixed(1)}ms`);

