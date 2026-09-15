# Cinejoy CSS reverse-engineering — analysis & port map

> Everything here was pulled from the **real** Cinejoy build, not from guessing:
> the app entry (`/_app/immutable/entry/app.*.js`) was crawled module-graph-wide
> and every referenced CSS asset downloaded into `css/`. See the harness notes
> in `index.md` to regenerate on demand.

## How to query (the workflow we now have)

```bash
# re-download every page shell + CSS asset after Cinejoy ships a change
node scripts/fetch-cinejoy-css.mjs

# dump the exact minified rule for any class/variable/animation
node scripts/cinejoy-rules.mjs spotlight-badge
node scripts/cinejoy-rules.mjs --all pill-transition   # or pass component files
node scripts/cinejoy-rules.mjs "maintainScrollTop|nav-item" --all
```

## Asset gallery — file → component → Streamly relevance

| CSS file | Svelte component / role | Where it shows up |
| --- | --- | --- |
| `0.ugGWN4mw.css` (158 KB) | global design system: theme vars, nav, glass, grid, buttons, responsive | every page — mine this with `cinejoy-rules.mjs` for any shared class |
| `DiscoveryPage.DCzCrL7d.css` | Movies/Series landing: `.scrollbar-hide`, `.spotlight-badge` | our `/movies` `/series` (`DiscoveryPage.jsx`) |
| `FilterDropdown.CDsMnm-0.css` | filter pill dropdown custom scrollbar (4px, `#fff3`) | our `.discovery-menu` |
| `PillButton.BWzYF7nO.css` | `.theme-btn-primary` white / `.theme-btn-secondary` white/10 | CTA buttons, active pills |
| `MediaCard.C9xRv7Wo.css` | poster card shake keyframe (added-to-list feedback) | our `MovieCard` |
| `MovieRow.ZgMFEjqB.css` | landscape rail wrapper (`maintainScrollTop`, scroll buttons) | our `DiscoveryRails` / upcoming rail |
| `AuroraBackground.4jvOEIYU.css` | ambient conic liquid blobs behind hero | our `AmbientBackground.jsx` (re-implemented) |
| `Skeleton.Cyoc74Fb.css` | shimmer block | our skeletons |
| `TitleVote.BQ5-nsye.css` | star/section rating badge behaviour | our `RatingsCluster` |
| `WheelPicker.CS6vqSrg.css` | iOS-style dial for season/episode pickers | watch page (future) |
| `DisplayNameModal`, `DownloadModal`, `AddToListPopover`, `ScrapingScreen` | dialogs | watch/settings parity (future) |
| `VideoPlayer.amzfpZvj.css` (31 KB) | full video player chrome | our `CustomVideoPlayer` (already React-ported) |
| `4.Bnda1CY3`, `6.DarDZktU`, `7.D-hdBjYb`, `11.DDe79v4G`, `12.CkehbY3o`, `14.Cetdz9Ym`, `19.CjxmbbWe`, `2.BSOuPt4Y`, `20.BLodlHfJ`, `21.0PixXaEN`, `22.CwT8s0WQ`, `8.DVW3-EwS` | layout/page chunks loaded on demand (movies list, hero, media detail, etc.) | grep each by *structural* class name to find which page owns it |

## Theme machinery (why rules talk in variables)

The palette is **not in the CSS** — Cinejoy injects `--theme-*` variables as
inline `element.style` on the app root (see the saved `html/*.html` dumps).
CSS only consumes them, e.g.:

```css
html[data-theme]:not([data-theme=default]) .theme-pill-bg {
  background-color: var(--theme-global-accentA, var(--theme-themePreview-primary));
}
```

Defaults we observed (Cinejoy default theme):
`--theme-pill-background:#3c324f`, `--theme-dropdown-background:#1d1728`,
`--theme-type-logo:#95ff50`, `--theme-background-main:#050505`,
hidden scrollbars (`scrollbar-width:none`).

`data-flat-ui=on` / `data-glass-refract=on` / `data-theme-id=*` switch flat /
refraction / aero surfaces — our app folds the best of these into its own
glass utilities, no need to replicate the whole state machine.

## Verified ground-truth primitives (port these verbatim)

```
.spotlight-badge  bottom:0; left:50%; transform:translate(-50%);
                  padding:4px 12px; border-radius:7px 7px 0 0;
                  font-size:11px; font-weight:500; line-height:1.45;
                  background:#3c8217; color:#fff;           (themed: accentA 45% / #071a08)

.scroll-to-top-btn  width/height:44px; border-radius:9999px;
                    background:#ffffff1a; border:2px solid #95ff50;
                    backdrop-filter:blur(20px) saturate(150%);
                    box-shadow:0 10px 30px #0000004d;
                    bottom:calc(6rem + env(safe-area-inset-bottom,20px)); right:1rem

.glass-dropdown  background:#0f0f0fb8; backdrop-filter:blur(28px) saturate(180%);
                 border:1px solid rgba(255,255,255,.08);
                 box-shadow:0 20px 50px #00000080; isolation:isolate

:root nav tokens  --nav-transition:.4s cubic-bezier(.34,1.56,.64,1);
                   --nav-fade:.3s ease; --nav-pad:6px; --nav-item-h:40px

.nav-item  height:var(--nav-item-h); transition:color/background-color var(--nav-fade)
.nav-item.is-icon  width:var(--nav-item-h)
.theme-pill-bg  background:#fff   (themed: var(--theme-global-accentA))

.custom-scrollbar  ::-webkit-scrollbar width:4px; thumb rgba(255,255,255,.2→.4);
                   ::-webkit-scrollbar-button:none

.mobile-nav-bar  bottom:calc(env(safe-area-inset-bottom,0px) + 1rem)
@media(orientation:landscape) and (max-height:500px) → scale(.75), origin:bottom
```

## Already applied to Streamly (this session)

- `src/index.css` `.spotlight-badge` — replaced the guessed top-left green-glow
  pill with the **real** bottom-center `#3c8217` tab.
- `src/components/BackToTop.jsx` — knob now mirrors `.scroll-to-top-btn`:
  `2px solid #95ff50` ring, `blur(20px) saturate(150%)`, white/10 glass.

## Port backlog (checked when each page is sweated)

- `FilterDropdown` 4px scrollbar → fold into `.discovery-menu` + any menu.
- `.theme-pill-bg` white active pill ✅ our nav pill already white-on-dark.
- Hero / landing `20.BLodlHfJ.css` + `AuroraBackground` grid + media queries → hero parity.
- `TitleVote` star rating → `RatingsCluster` fine-tune.
- Watch page: `WheelPicker`, `ScrapingScreen`, `DownloadModal` chrome → player parity.