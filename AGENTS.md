# AGENTS.md — universal agent entrypoint

> This file exists so **any** coding agent (opencode, Claude Code, OpenAI
> Codex, Google Antigravity, Cursor, freebuff/Cline, Copilot — anything that
> reads `AGENTS.md`) follows the same rules. If your harness prefers another
> filename (`CLAUDE.md`, `.opencode/`, `.cursorrules`), treat this file as
> authoritative and mirror it there — do not fork the rules.

## Mandatory boot (every session, every task)

1. Read `task.md` — work the **ordered checkbox list top-down**; check off
   boxes as you go; never work out of order.
2. Read `README.md` (installs), `.env` + `.env.example` (env vars),
   `vercel.json` (deploy), `src/api/tmdbClient.js` + `src/api/omdbClient.js`
   (keys), then `prd.md`, `architecture.md`, `vibecoder.md`.
3. Follow `vibecoder.md` workflow 1-2-3-4-5. The short version: read first,
   minimal diffs, never fail silently, verify with
   `npm run lint` + `npm run test` + `npm run build`, record in `task.md`.

## Non-negotiables

- Data/UI contract: `normalizeResult` fields, React Query keys, localStorage
  keys, and route paths in `architecture.md` §2–3 are frozen unless the user
  orders a migration.
- No silent failures: all diagnostics via `src/utils/debugLogger.js` as
  `[Streamly][scope]` logs. No bare `catch {}`, no raw `console.*` in `src/`.
- Never commit `.env`, `node_modules/`, `dist/`, or secrets. Never revive the
  `env.js` backend/Firebase without an explicit order.
- Keep docs truthful: if a contract changes, update `prd.md` /
  `architecture.md` / `task.md` in the same change.
