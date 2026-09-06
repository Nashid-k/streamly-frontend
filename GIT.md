# 🎨 Streamly Frontend — Git Guide

> **React 19** · Vite 8 · TanStack Query · Framer Motion · React Router v7
>
> Repository: `github.com/Nashid-k/streamly` · Branch: `main`

---

## 📋 Table of Contents

- [Repository Overview](#-repository-overview)
- [Branch Strategy](#-branch-strategy)
- [Commit Message Convention](#-commit-message-convention)
- [Daily Workflow](#-daily-workflow)
- [Working with Components & Pages](#-working-with-components--pages)
- [Environment & Build Artifacts](#-environment--build-artifacts)
- [Useful Git Aliases](#-useful-git-aliases)
- [Undoing Mistakes](#-undoing-mistakes)
- [Deployment Flow](#-deployment-flow)
- [Commit History Highlights](#-commit-history-highlights)

---

## 🗺️ Repository Overview

```
.
├── index.html                       ← App entry point (Vite)
├── vite.config.js                   ← Vite build config
├── vitest.config.js                 ← Test config (jsdom + globals)
├── vercel.json                      ← Vercel SPA routing rules
├── .oxlintrc.json                   ← Oxlint linting rules
│
├── public/                          ← Static assets (favicon, icons, sw.js)
│
└── src/
    ├── main.jsx                     ← ReactDOM.createRoot, QueryClient, Router
    ├── App.jsx                      ← Top-level routing & layout
    ├── ServerWakeupNotification.jsx ← Render cold-start UX banner
    ├── index.css                    ← Global styles, CSS variables, animations
    ├── utils.js                     ← Shared utilities (decodeUrl, asArray)
    ├── utils/                       ← Domain helpers (timezone, ratings, notifications…)
    │
    ├── api/
    │   ├── movieService.js          ← fetch() wrappers for all backend endpoints
    │   ├── apiClient.js             ← axios instance + interceptors
    │   ├── platformAdapter.js        ← Platform registry + source normalization
    │   └── (cdnImageAdapter, authAdapter, storageAdapter, serverHealth, …)
    │
    ├── hooks/
    │   ├── useDebounce.js           ← Input debounce hook
    │   ├── useMediaQuery.js         ← Responsive breakpoint matching
    │   ├── useScrollRestoration.js  ← Scroll restore across routes
    │   └── useUserData.js           ← Auth state, myList, continueWatching
    │
    ├── components/                  ← Reusable UI building blocks
    │   ├── MovieCard.jsx            ← Cinematic glass-panel hover card
    │   ├── CustomVideoPlayer.jsx    ← HLS player + episode/source switcher
    │   ├── ConfirmDialog.jsx        ← Modal dialog component
    │   ├── Toast.jsx                ← Notification toasts
    │   ├── GlobalShortcuts.jsx      ← Keyboard shortcut handler
    │   ├── Loader.jsx               ← Loading spinner
    │   ├── BackToTop.jsx            ← Scroll-to-top button
    │   └── ErrorBoundary.jsx        ← React error boundary
    │
    └── pages/                       ← Route-level page components
        ├── Home.jsx                 ← Main landing page
        ├── TitleDetails.jsx         ← Player + metadata page (largest page)
        ├── SearchPage.jsx           ← Search results with filters
        ├── GenrePage.jsx            ← Genre-filtered catalog
        ├── CategoryPage.jsx         ← Category drill-down
        ├── WatchlistPage.jsx        ← My List page
        ├── HistoryPage.jsx          ← Continue Watching / History
        └── PersonDetails.jsx        ← Actor/Director profile
```

---

## 🌿 Branch Strategy

```
main  ────────────────────────────────────────────────────────► production (Vercel)
        │
        ├── feat/cinematic-hover-card      feature branches
        ├── fix/favicon-gradient
        ├── style/episode-grid-overhaul
        └── perf/virtualization
```

| Branch pattern | Purpose | Merges into |
|---|---|---|
| `main` | Stable, deployed to Vercel | — |
| `feat/<name>` | New pages, major features | `main` via PR |
| `fix/<name>` | Bug fixes | `main` via PR |
| `style/<name>` | UI/CSS-only changes | `main` via PR |
| `perf/<name>` | Virtualization, memoization | `main` via PR |
| `chore/<name>` | Cleanup, deps, config | `main` via PR |

### Creating a feature branch

```bash
# Always branch from the latest main
git switch main
git pull origin main

git switch -c feat/add-genre-filter-chips
```

---

## 💬 Commit Message Convention

This repository follows **Conventional Commits** — the existing history is a perfect template:

```
<type>(<optional scope>): <short description>

[optional body]

[optional footer]
```

### Allowed types

| Type | When to use | Example |
|---|---|---|
| `feat` | New page, component, or feature | `feat: add progressive loading and history timeline` |
| `fix` | Bug repair | `fix: add missing X icon import in HistoryPage` |
| `style` | Visual / CSS changes, no logic | `style: remove episode pills and overhaul episode grid card UI` |
| `perf` | Virtualization, memoization, lazy loading | `perf: major performance overhauls (virtualization, memoization)` |
| `refactor` | Internal restructuring | `refactor: flatten nested ternaries in App.jsx` |
| `chore` | Deps, CI, build, cleanup | `chore: code cleanup` |
| `docs` | Documentation | `docs: update component API in GIT.md` |
| `test` | Tests | `test: add MovieCard render tests` |

### ✅ Good commit messages (from this repo's actual history)

```
feat: add progressive loading, history timeline, and shortcuts modal
style: remove redundant play button when watching trailers
feat: server switcher, custom season dropdown, episode pills wrapping
fix: cinematic curtain hover on all remaining pages
feat(MovieCard): replace Netflix hover popout with Streamly-native glass panel
fix(favicon): match navbar logo — rose→orange gradient rounded-rect with Play icon
```

### ❌ Bad commit messages

```
update
changes to movie card
css stuff
asdfgh
```

---

## 🔄 Daily Workflow

### 1. Start your day

```bash
cd frontend

# Pull the latest changes
git pull origin main

# Start the dev server
npm run dev   # → http://localhost:5173
```

### 2. Make a change

```bash
# Create your branch
git switch -c style/hero-banner-animation

# ... edit files ...

# Stage specific files
git add src/pages/Home.jsx
git add src/index.css

# Review what you're committing
git diff --staged

# Commit
git commit -m "feat: animate hero banner description on hover with 5s delay"
```

### 3. Sync before pushing

```bash
git fetch origin
git rebase origin/main
# Resolve conflicts if any, then:
git rebase --continue
```

### 4. Push and open PR

```bash
git push origin style/hero-banner-animation
# → Open PR on GitHub targeting main
```

---

## 🏗️ Working with Components & Pages

### Adding a new page

```bash
git switch -c feat/settings-page

# Create the file
touch src/pages/SettingsPage.jsx

# Add the route in App.jsx, stage both
git add src/pages/SettingsPage.jsx
git add src/App.jsx

git commit -m "feat: add Settings page with route at /settings"
```

### Adding a new reusable component

```bash
git switch -c feat/skeleton-loader

touch src/components/SkeletonCard.jsx

git add src/components/SkeletonCard.jsx
git commit -m "feat: add SkeletonCard loading placeholder component"
```

### Editing large files (CustomVideoPlayer.jsx ~3.7k lines, TitleDetails.jsx ~2.5k lines)

These files are large and get touched frequently. To avoid messy diffs:

```bash
# 1. Only stage what you intentionally changed
git add -p src/components/CustomVideoPlayer.jsx   # interactive patch mode — review hunk by hunk

# 2. Keep commits focused — one logical change per commit
git commit -m "feat: simplify player header buttons to just Prev Ep / Next Ep"
```

### Updating styles (index.css ~20 KB)

```bash
git add src/index.css
git commit -m "style: refine movie card hover shadow and transition timing"
```

### Updating API calls (movieService.js)

```bash
git add src/api/movieService.js
git commit -m "feat: add getRecommendations endpoint call to movieService"
```

---

## 🔒 Environment & Build Artifacts

> **Never commit `.env` files or `dist/`.** Both are already in `.gitignore`.

```
.env                  ← gitignored ✅
node_modules/         ← gitignored ✅
dist/                 ← gitignored ✅  (Vercel builds this from source)
dist-ssr/             ← gitignored ✅
*.local               ← gitignored ✅
*.log                 ← gitignored ✅
.DS_Store             ← gitignored ✅
```

### Environment variables

```bash
# .env (local — never commit)
VITE_API_URL=http://localhost:4000/api

# Production — set in Vercel dashboard
VITE_API_URL=https://your-backend.onrender.com/api
```

> **Vite exposes only `VITE_`-prefixed variables** to the browser bundle.
> Never prefix sensitive server-side values with `VITE_`.

### Create a safe template

```bash
cp .env .env.example
# Replace real values with placeholders in .env.example
git add .env.example
git commit -m "chore: add .env.example for quick project setup"
```

---

## ⚡ Useful Git Aliases

Add to `~/.gitconfig`:

```ini
[alias]
  lg    = log --oneline --graph --decorate --all
  st    = status -sb
  sw    = switch
  oops  = commit --amend --no-edit
  wip   = !git add -A && git commit -m "wip: checkpoint [skip ci]"
  undo  = reset HEAD~1 --mixed
  pub   = push -u origin HEAD
  last  = log -1 HEAD --stat
  who   = shortlog -n -s --no-merges
  nuke  = !git reset --hard && git clean -fd
  patch = add -p
```

### Usage

```bash
git lg            # visual branch/commit graph
git st            # compact status (M for modified, ? for untracked)
git patch         # interactively choose which hunks to stage (great for large files!)
git oops          # amend last commit without editing the message
git undo          # unsave last commit, keep working changes
git wip           # quick checkpoint before switching tasks
git pub           # push current branch and set upstream in one command
git nuke          # ⚠️  wipe all local changes (use carefully!)
```

---

## 🩹 Undoing Mistakes

### Undo last commit (keep work staged)

```bash
git reset --soft HEAD~1
```

### Undo last commit (keep work unstaged)

```bash
git reset --mixed HEAD~1
```

### Discard changes in a specific file

```bash
git checkout -- src/pages/Home.jsx
```

### Discard ALL local changes

```bash
git restore .
# or the nuclear option:
git reset --hard && git clean -fd
```

### Accidentally committed `node_modules` or `dist`

```bash
# Remove from git tracking without deleting the actual files
git rm -r --cached dist/
git rm -r --cached node_modules/

# Make sure they're in .gitignore
echo "dist" >> .gitignore
echo "node_modules" >> .gitignore

git add .gitignore
git commit -m "fix: stop tracking build artifacts — update gitignore"
```

### Revert a bad commit already on `main`

```bash
# NEVER force-push to main — always use revert
git revert <commit-hash>
git push origin main
```

### Stash work in progress when switching tasks

```bash
# Save current work without committing
git stash push -m "wip: experimenting with glass morphism cards"

# List saved stashes
git stash list

# Restore most recent stash
git stash pop

# Restore a specific stash
git stash apply stash@{2}
```

---

## 🚀 Deployment Flow

The frontend is deployed on **Vercel** with automatic deployments on every push to `main`.

```
Local branch
    │
    │  git push origin feat/xxx
    ▼
GitHub PR (preview deployment created by Vercel)
    │  → Unique preview URL for review
    │
    │  Merge into main
    ▼
main branch pushed
    │
    │  Vercel auto-deploys
    ▼
Production (Vercel CDN)
    build: vite build
    output: dist/
    routing: vercel.json (SPA fallback → index.html)
```

### Vercel preview deployments

Every pull request gets an automatic **preview URL** from Vercel. Use it to:
- Test UI changes before merging
- Share with teammates for review
- Verify mobile responsiveness

### Pre-push checklist

```bash
# 1. Lint passes
npm run lint

# 2. Build succeeds locally
npm run build

# 3. Preview the production build
npm run preview

# 4. No secrets leaked in the bundle
grep -r "TMDB_API_KEY\|jwt_secret\|password" dist/ && echo "⚠️  SECRET IN BUILD" || echo "✅ Clean"
```

---

## 📜 Commit History Highlights

> Real commits from this repository — your style compass.

| Hash | Type | Description |
|---|---|---|
| `6bc1f78` | `fix` | Add missing X icon import in HistoryPage |
| `026b116` | `feat` | Add progressive loading, history timeline, and shortcuts modal |
| `9125e43` | `style` | Remove redundant play button when watching trailers |
| `942fcca` | `style` | Remove episode pills and overhaul episode grid card UI |
| `61cdaf4` | `feat` | Simplify player header buttons to just Prev Ep / Next Ep |
| `ebc79da` | `feat` | Move server switcher to player header as dropdown |
| `efeaf6a` | `feat` | Animate hero banner description on hover with 5s delay |
| `c528a44` | `feat` | Server switcher, custom season dropdown, episode pills wrapping |
| `f606d27` | `feat(MovieCard)` | Cinematic curtain hover — zero-bug, zero-portal, whileHover driven |
| `6d7d596` | `feat(MovieCard)` | Replace Netflix hover popout with Streamly-native glass panel |
| `48993fe` | `perf` | Major overhauls (virtualization, memoization, API aggregation) |

---

## 🔗 Quick Reference Card

```bash
# ── Setup ──────────────────────────────────────────────
git clone https://github.com/Nashid-k/streamly.git frontend
cd frontend && npm install
cp .env.example .env        # fill in VITE_API_URL
npm run dev                 # http://localhost:5173

# ── Every day ──────────────────────────────────────────
git switch main && git pull origin main
git switch -c feat/your-feature
npm run dev

# ── Stage & commit ─────────────────────────────────────
git add src/components/YourComponent.jsx
git commit -m "feat: add YourComponent with glass panel animation"

# ── Review large file changes interactively ────────────
git add -p src/components/CustomVideoPlayer.jsx

# ── Sync before PR ─────────────────────────────────────
git fetch origin && git rebase origin/main
git push origin feat/your-feature

# ── Emergency rollback on main ─────────────────────────
git revert <bad-commit-hash>
git push origin main
```

---

## 🎯 Component-Specific Tips

### `App.jsx` (routing hub)

When editing `App.jsx`, always commit route changes and the new page file together:

```bash
git add src/App.jsx src/pages/NewPage.jsx
git commit -m "feat: add NewPage route at /new-page"
```

### `CustomVideoPlayer.jsx` (largest file)

Use interactive staging to pick only your changes:

```bash
git add -p src/components/CustomVideoPlayer.jsx
# Press 'y' to stage a hunk, 'n' to skip, 's' to split, '?' for help
```

### `index.css` (global styles)

Separate CSS commits from JS commits where possible — it makes reverting UI changes much easier:

```bash
# CSS-only change
git add src/index.css
git commit -m "style: increase movie card border-radius to 12px"

# JS logic change
git add src/pages/Home.jsx
git commit -m "feat: add skeleton loading state to Home page"
```

---

*Last updated: August 2026 · Streamly Frontend v0.0.0*
