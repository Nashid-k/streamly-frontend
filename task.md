# Streamly task log

## 2026-11-17 — Horizontal rail reduced-motion fix

- [x] Keep the existing rail-level reveal and CSS rule that disables per-card entrance animations inside `.movie-rail`.
- [x] Make rail-arrow scrolling use `behavior: "auto"` when either the in-app reduced-motion setting or the OS preference is enabled.
- [x] Add regression coverage for normal, app-preference, OS-preference, and combined reduced-motion states.
- [ ] Run `npm run lint`, `npm run test`, and `npm run build` in a Node 22/24-compatible project environment. This ChatGPT GitHub connection can edit and push repository files but does not expose a shell/runtime to execute npm commands; do not mark these gates passed without actual execution.
