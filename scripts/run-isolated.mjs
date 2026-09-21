import { fork } from "node:child_process";

export function runIsolated(request, { timeoutMs = 60000, memoryMb = 256 } = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(new URL("simulation-worker.mjs", import.meta.url), [], {
      execArgv: [`--max-old-space-size=${memoryMb}`, "--stack-size=1024"], stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true,
    });
    let settled = false, errors = "";
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`Simulation job failed: timeout after ${timeoutMs} ms`)), timeoutMs);
    child.stderr.on("data", data => { errors = (errors + data.toString()).slice(-4000); });
    child.on("error", error => finish(error));
    child.on("message", message => message.ok ? finish(null, message.result) : finish(new Error(message.error)));
    child.on("exit", (code, signal) => { if (!settled) finish(new Error(`Simulation job failed: exit=${code}, signal=${signal}. ${errors}`)); });
    child.send(request, error => { if (error) finish(error); });
  });
}
