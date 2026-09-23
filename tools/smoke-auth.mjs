import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

export async function smokeAuth(prefix) {
  const external = process.env[`${prefix}_API_URL`];
  if (external) return {
    base: external.replace(/\/$/, ""),
    credential: async suffix => {
      const token = process.env[`${prefix}_GOOGLE_TOKEN_${suffix.toUpperCase()}`] ?? process.env[`${prefix}_GOOGLE_TOKEN`];
      if (!token) throw new Error(`${prefix}_GOOGLE_TOKEN_${suffix.toUpperCase()} is required for external smoke.`);
      return token;
    },
    close: async () => {},
  };
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const key = { ...await exportJWK(publicKey), kid: "smoke", alg: "RS256", use: "sig" };
  const jwks = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "max-age=60" });
    response.end(JSON.stringify({ keys: [key] }));
  });
  const jwksPort = await listen(jwks);
  const probe = createServer();
  const port = await listen(probe);
  probe.close();
  await once(probe, "close");
  const dir = await mkdtemp(join(tmpdir(), "promptchien-smoke-"));
  const child = spawn(process.execPath, ["apps/api/src/node.mjs"], {
    env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(port), PROMPTCHIEN_DB_PATH: join(dir, "api.sqlite"), GOOGLE_CLIENT_ID: "smoke-client", GOOGLE_JWKS_URL: `http://127.0.0.1:${jwksPort}/certs`, WEB_ORIGIN: `http://127.0.0.1:${port}`, REPLAY_SHARE_SECRET: "smoke-share-secret" },
    stdio: "ignore",
  });
  process.on("exit", () => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
    if (i === 99) throw new Error("Smoke API did not start.");
  }
  return {
    base,
    credential: suffix => new SignJWT({ sub: `smoke-${suffix}`, email: `smoke-${suffix}@example.test`, name: `Smoke ${suffix}` })
      .setProtectedHeader({ alg: "RS256", kid: "smoke" }).setIssuer("https://accounts.google.com").setAudience("smoke-client").setIssuedAt().setExpirationTime("1h").sign(privateKey),
    close: async () => {
      child.kill();
      if (child.exitCode === null) await once(child, "exit");
      jwks.close();
      await once(jwks, "close");
      await rm(dir, { recursive: true, force: true });
    },
  };
}
