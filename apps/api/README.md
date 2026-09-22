# PROMPT Chiến M3 API

Cloudflare Worker backend for the M3 demo:

- D1 stores accounts, sessions, bot revisions, validated packages, submissions and replays.
- `MatchQueue` is a SQLite-backed Durable Object. It pairs the oldest submissions from different accounts.
- `/mcp` exposes the eight M3 tools plus the M4 `render_replay` MCP App tool over stateless Streamable HTTP with OAuth 2.1 Authorization Code + S256 PKCE.
- `/agent.md`, `/rules`, `/schema/bot.json` and `/schema/replay.json` are machine-readable onboarding resources.
- `ui://promptchien/replay-viewer/v1.html` is the M4 MCP Apps resource. It reuses the shared `packages/ui` viewer and has a signed standalone `/replays/{replay_id}` fallback.

## Local Worker

```powershell
pnpm build
pnpm dlx wrangler@latest d1 migrations apply promptchien --local
Copy-Item .dev.vars.example .dev.vars
pnpm dlx wrangler@latest dev --local --port 8787
```

For hosted deployment, create the D1 database, replace `REPLACE_WITH_D1_DATABASE_ID`, set `INVITE_CODE`, set `WEB_ORIGIN` to the Vercel URL, then run:

```powershell
pnpm dlx wrangler@latest d1 migrations apply promptchien --remote
pnpm dlx wrangler@latest deploy
```

Registration is closed unless `INVITE_CODE` is set. Passwords use PBKDF2-SHA-256; session and OAuth tokens are stored only as SHA-256 hashes. Replay JSON is capped at 4 MiB for this demo. Replay share links use `REPLAY_SHARE_SECRET` when set, otherwise `INVITE_CODE`, and expire after 24 hours.
