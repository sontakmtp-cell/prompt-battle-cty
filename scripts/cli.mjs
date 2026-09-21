import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runIsolated } from "./run-isolated.mjs";

const [command, ...args] = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); if (i < 0) return undefined; if (!args[i+1] || args[i+1].startsWith("--")) throw new Error(`Missing value for ${name}`); return args[i+1]; };
const read = (path, limit = 4 * 1024 * 1024) => {
  if (!path || path.startsWith("--")) throw new Error("Missing input path");
  if (statSync(path).size > limit) throw new Error(`Input exceeds ${limit} bytes`);
  return JSON.parse(readFileSync(path, "utf8"));
};
const write = (path, value) => {
  const target = resolve(path), temporary = `${target}.${process.pid}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { flag: "wx" }); renameSync(temporary, target);
};

try {
  if (command === "validate") {
    const result = await runIsolated({ kind: "validate", bot: read(args[0]) });
    const out = option("--out"); if (out) write(out, result);
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.report.valid ? 0 : 1;
  } else if (command === "simulate") {
    const seed = Number(option("--seed") ?? "42");
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("--seed must be uint32");
    const result = await runIsolated({ kind: "simulate", a: read(args[0]), b: read(args[1]), seed });
    const out = option("--out") ?? "artifacts/match.json"; write(out, result.replay);
    console.log(JSON.stringify({ replay: resolve(out), hash: result.replay.manifest.dataHash, result: result.replay.manifest.result, stats: result.stats }, null, 2));
  } else if (command === "replay") {
    const replay = read(args[0], 64 * 1024 * 1024), tick = option("--at");
    const result = await runIsolated(tick === undefined ? { kind: "verify", replay } : { kind: "seek", replay, tick: Number(tick) });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("pnpm cli validate bot.json [--out report.json]\npnpm cli simulate botA.json botB.json --seed 42 --out artifacts/match.json\npnpm cli replay artifacts/match.json [--at 90]");
    if (command && command !== "--help") process.exitCode = 1;
  }
} catch (error) { console.error(JSON.stringify({ status: "failed", error: error.message })); process.exitCode = 2; }
