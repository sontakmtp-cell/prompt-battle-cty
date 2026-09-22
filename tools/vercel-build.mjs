import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const build = spawnSync(pnpm, ["build"], { stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) process.exit(build.status ?? 1);

await rm("dist", { recursive: true, force: true });
await mkdir("dist/app", { recursive: true });
await mkdir("dist/pkg/ui", { recursive: true });
await mkdir("dist/pkg/contracts", { recursive: true });
await mkdir("dist/pkg/application", { recursive: true });
await cp("apps/web/index.html", "dist/index.html");
await cp("apps/web/lab.css", "dist/lab.css");
await cp("apps/web/runtime-config.js", "dist/runtime-config.js");
await cp("apps/web/dist", "dist/app", { recursive: true });
await cp("packages/ui/dist", "dist/pkg/ui", { recursive: true });
await cp("packages/contracts/dist", "dist/pkg/contracts", { recursive: true });
await cp("packages/application/dist", "dist/pkg/application", { recursive: true });

const apiBase = JSON.stringify(process.env.PROMPTCHIEN_API_BASE ?? "");
await writeFile("dist/runtime-config.js", `window.PROMPTCHIEN_API_BASE = ${apiBase};\n`, "utf8");
