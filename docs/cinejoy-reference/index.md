# Cinejoy CSS reference (auto-extracted)

Origin: https://cinejoy.to · routes: /, /movies, /series, /search, /watch, /film, /settings · generated: 2026-09-15T22:18:29.731Z

## CSS assets

| File | Size |
| --- | ---: |
| 0.ugGWN4mw.css | 158 KB |
| 11.DDe79v4G.css | 3 KB |
| 12.CkehbY3o.css | 0 KB |
| 14.Cetdz9Ym.css | 0 KB |
| 19.CjxmbbWe.css | 1 KB |
| 2.BSOuPt4Y.css | 1 KB |
| 20.BLodlHfJ.css | 15 KB |
| 21.0PixXaEN.css | 3 KB |
| 22.CwT8s0WQ.css | 1 KB |
| 4.Bnda1CY3.css | 1 KB |
| 6.DarDZktU.css | 0 KB |
| 7.D-hdBjYb.css | 0 KB |
| 8.DVW3-EwS.css | 5 KB |
| AddToListPopover.CpnupeLy.css | 0 KB |
| AuroraBackground.4jvOEIYU.css | 3 KB |
| DiscoveryPage.DCzCrL7d.css | 1 KB |
| DisplayNameModal.gFHMVqTh.css | 2 KB |
| DownloadModal.CtWnuRf-.css | 3 KB |
| FilterDropdown.CDsMnm-0.css | 0 KB |
| MediaCard.C9xRv7Wo.css | 0 KB |
| MovieRow.ZgMFEjqB.css | 0 KB |
| PillButton.BWzYF7nO.css | 1 KB |
| ScrapingScreen.B1G9j5qP.css | 2 KB |
| Skeleton.Cyoc74Fb.css | 0 KB |
| TitleVote.BQ5-nsye.css | 5 KB |
| VideoPlayer.amzfpZvj.css | 31 KB |
| WheelPicker.CS6vqSrg.css | 1 KB |

## Notes

- The base filename (before the first `.`) is the Svelte component that
  owns the styles, e.g. `DiscoveryPage.*.css`, `MediaCard.*.css`.
- The giant `0.*.css` chunk is the global/design-system CSS (theme tokens,
  nav, hero, grids, responsive rules).
- Class names are scoped with Svelte's `.svelte-<hash>` suffixes; rule
  contents (colors, spacing, animation, media queries) port directly.
- Theme token values (the `--theme-*` palette) are injected by app JS as
  inline `element.style` — see the CSS variables in each `html/*.html`
  dump from the running app.

Re-run anytime: `node scripts/fetch-cinejoy-css.mjs`