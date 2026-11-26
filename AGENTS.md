# AGENTS.md — universal agent entrypoint

> This file exists so **any** coding agent (opencode, Claude Code, OpenAI
> Codex, Google Antigravity, Cursor, freebuff/Cline, Copilot — anything that
> reads `AGENTS.md`) follows the same rules. If your harness prefers another
> filename (`CLAUDE.md`, `.opencode/`, `.cursorrules`), treat this file as
> authoritative and mirror it there — do not fork the rules.

## Canonical UI/UX + motion target (user order, 2026-11-25)

`streamly_2.0.html` at the repo root is the **actual target UI/UX and animation
spec** for Streamly, not a mood board or optional reference. Every AI and every
UI/motion change must match its visible layout, states, interaction choreography,
and measured timings. When a doc, an old design decision, or a 1.0-era
implementation disagrees with that file about **appearance or motion**, the file
wins. `docs/vibecoder.md` §6 is the enforced checklist; `docs/prd.md` §7 and
`docs/architecture.md` §6-invariants carry the product/contract framing.

Non-negotiable extracts (full contract in `docs/vibecoder.md` §6):

- Exact final tokens (`streamly_2.0.html:278-280`): `--dur-1:220ms`,
  `--dur-2:300ms`, `--dur-3:400ms`, `--dur-4:640ms`, `--dur-view:620ms`,
  `--dur-poster:780ms`, `--dur-nav:520ms`, `--stagger:55ms`,
  `--ease-in-out:cubic-bezier(.4,0,.2,1)`,
  `--sp:cubic-bezier(.34,1.25,.64,1)`, `--ease:cubic-bezier(.22,1,.36,1)`.
  Aliases: `state=1`, `tap=2`, `reveal=3`, `content=4`. Skeleton shimmer `1.8s`;
  detail skeleton dwell `640 + 55*6 + 120 = 1090ms`; hero rotation `9s`.
- View Transition owns route changes via the 2.0 `vt(f)` queue; nav/search
  snapshots are hidden, the shared poster token is
  `${scope}:${index}:${id}` (React app: `data-detail-token="<rail>:<index>:<movie.id>"`),
  and reverse restores page scroll, every rail `scrollLeft`, source rail, hero
  index, and focus before the final snapshot. Reduced motion bypasses the
  sequence.
- 2.0 visual language: iOS-like glass surfaces, Inter/SF stack, bottom pill nav
  with sliding `#pill` + `navwave`/sheen, top-right expanding search, `.hbd`
  hero with dots, `2/3` posters with 3D tilt, qp/qa overlays, rail arrows,
  scene-coloured skeletons, `.dh` detail grid + facts/cast/season tabs with an
  8-episode cap, and fade/idle player HUD.
- This is a **visual/motion migration only**. Never import the HTML demo's
  Lumen data, `lumen*` localStorage keys, or hardcoded TMDB key into the React
  app. `normalizeResult`, query keys, Streamly localStorage keys, routes, and
  the desktop-only web target stay frozen unless the user orders a migration.
- `streamly_2.0.html` is currently an **untracked local artifact** and contains
  a hardcoded TMDB key at line 492. Read it; never stage or commit it.

## Mandatory boot (every session, every task)

1. Read `task.md` — work the **ordered checkbox list top-down**; check off
   boxes as you go; never work out of order.
2. Read `README.md` (installs), `.env` + `.env.example` (env vars),
   `vercel.json` (deploy), `src/api/tmdbClient.js` + `src/api/omdbClient.js`
   (keys), then `prd.md`, `architecture.md`, `vibecoder.md`. For any UI/UX,
   styling, animation, navigation, skeleton, or player-shell task also read
   `streamly_2.0.html` itself before editing — the summary above is a pointer,
   not a substitute.
3. Follow `vibecoder.md` workflow 1-2-3-4-5. The short version: read first,
   minimal diffs, never fail silently, verify with
   `npm run lint` + `npm run test` + `npm run build`, record in `task.md`.
4. **This is a DESKTOP-ONLY repository (user decision, 2026-10-01).** The
   Flutter `mobile/` app was deleted outright. There is no Dart, no APK, and
   no mobile target of any kind — do not recreate one, do not add a
   `.dart`/`.yaml` mobile scaffold, and do not report a Dart gate as
   passed. `npm run lint` + `npm run test` + `npm run build` are the only
   gates. Responsive *web* layout is still in scope and is handled with
   container queries in `src/components/player/v2/player.css`.

## Git credentials

- The GitHub PAT for `github.com` (user `Nashid-k`) lives in **Windows
  Credential Manager** (git helper `manager`, encrypted) — `git push`/`pull`
  authenticate on their own. Do **not** ask the user for a token again, and
  never write one into the repo, a config file, or a command that echoes it.

## Non-negotiables

- Data/UI contract: `normalizeResult` fields, React Query keys, localStorage
  keys, and route paths in `architecture.md` §2–3 are frozen unless the user
  orders a migration.
- No silent failures: all diagnostics via `src/utils/debugLogger.js` as
  `[Streamly][scope]` logs. No bare `catch {}`, no raw `console.*` in `src/`.
- Never commit `.env`, `node_modules/`, `dist/`, APKs, or
  secrets. Never revive the `env.js` backend/Firebase without an explicit order.
- Keep docs truthful: if a contract changes, update `prd.md` /
  `architecture.md` / `task.md` in the same change.
