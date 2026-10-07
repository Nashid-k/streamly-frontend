# Senior Product-Designer Audit (RESEARCH ONLY, do NOT modify) of streamly-frontend

Scope: src/components/*, src/pages/*, src/styles/*.css
Pages: Home (hero + rails), Movies/Shows, Search, Genre, Category, TitleDetails, Watch player, MyList/Watchlist, History, Settings, Sign-in, verify-email, error boundary.

Evidence cited with file:line.


## A. Visual-language fragmentation

Distinct surface styles observed:
- Zinc/glass player chrome: uses .np-* classes, backdrop-filter, glass borders (src/components/player/chrome/*.jsx, src/components/player/*.jsx, src/styles/player.css)
- Apple-white CTA/hero treatment: .hero-cta-play white (tokens --btn-bg), Apple-style overlays (src/pages/HomePage.jsx:999-1134, src/styles/hero.css)
- Accent gradient motif: --accent-gradient used for Loader dot/glow (src/components/Loader.jsx:122-127), skeleton-glow (skeleton.css:53-67), head-menu avatar (primitives.css:92), ratings refresh hover (primitives.css:173-177)
- Plain card/rail surfaces: MovieCard (634 lines), rails in src/components/rails/*, neutral backgrounds

Tokens vs hardcoded:
- Design tokens defined: src/styles/tokens.css (164 lines) with --bg-*, --text-*, --accent-*, --btn-*, --radius-*, --spacing-*, --duration-*, --ease-*, --z-*
- Hardcoded hex: 560 occurrences outside tokens.css (per scan across src css/jsx)
- var(--*) usage: 381 total
- rgba hardcoded (non-var): 931 total

Button/chip/badge/pill/skeleton near-duplicates:
- Button variants: .btn, .btn-sm, .btn-lg, .btn-primary, .btn-secondary, .btn-glass, .btn-theaters, .btn-trailer, .btn-cta-pulse, .btn-ghost, .btn-danger, .btn-pill (src/styles/buttons.css, ui-kit.css)
- Component Button.jsx (38 lines) maps variant->tn-`n- Chip: .chip, .chip--sm, .chip--active (primitives.css:121-169), Chip.jsx (29 lines)
- PillAction: GHOST_PILL/ACCENT_PILL constants (browse/PillAction.jsx:2-17)
- Browse pills: .login-tab-pill (discovery.css:372), .seed-pill/.seed-row-pills (settings-ui.css:422-430), .search-chippill variants (search.css:564,594)
- Player buttons: .np-icon-btn, .np-resume-btn, .np-restart-btn (player.css:332,426,438,519,524-525)
- Hero/rail action pills: .hero-cta-play, .hero-action-pill, .hero-circle-btn, .hero-cta-secondary-icon (hero.css:368+), also in player.css duplicates (player.css:139-140)
- Badges: .badge (ui-kit.css:50), .countdown-badge-ring (buttons.css:147-166), maturity badges inline in pages
- Skeletons: .skeleton, .skeleton-card, .skeleton-hero, .skeleton-rail, .skeleton-moviecard, .skeleton-cast, .skeleton-circle, .skeleton-glow, stagger delays (skeleton.css:1-232); MovieDetailsSkeleton.jsx (224 lines)
- Spinner aliases: Loader.jsx (universal, variants page/inline/button/global, SVG dual-ring), RingSpinner (.np-tailspin/.np-ring-spinner in primitives.jsx:176, player.css:618-644), Loader2 imported in VerifyEmailPage.jsx:4 only; Tailspin CSS present (player.css:618+) but no component Tailspin exported.


## C. Redundant controls

Same actions in multiple places:
- Server switch/quality/audio: player chrome includes gear/settings surfaces (NativePlayerView.jsx + player chrome components). Menu structure in player panel/chrome; duplicates possible across transport/gear.
- My List toggle: Home hero action pill (HomePage.jsx:1110-1131 adds Check/Plus inside pill), TitleDetails has My List action (TitleDetailsPage.jsx hero/actions area), MovieCard has quick action (MovieCard.jsx), and Watchlist page manages lists.
- Theme/appearance: PreferencesContext (src/context/PreferencesContext.jsx) with theme; SettingsPage (1326 lines) contains appearance/theme controls (rows). Potential duplication with any legacy theme control.
- Navigation: Header (app/Header.jsx), MobileBottomNav (app/MobileBottomNav.jsx), in-page section buttons, Settings nav (left nav in SettingsPage). Multiple entry points to same destinations.
- Share/copy/trailer: Trailer button appears in Home hero CTAs (1098+), TitleDetails actions, player surfaces; share actions appear in multiple contexts.
- Info/details: hero Info (HomePage.jsx:1121-1131) opens details via openDetails; cards clickable to details; TitleInfoModal also exists.


## D. Spacing/radius/token debt

Spacing:
- Tokens include --spacing-xs..3xl (tokens.css:74-81). Also Tailwind arbitrary classes used in pages (e.g. Home hero inline styles like gap:'16px' at 1055, marginBottom values inline).
- Hardcoded px/gaps appear throughout pages (HomePage.jsx has inline padding/margins like 1093 style marginBottom:14, 1087 gap:10).

Radius:
- Tokens: --radius-xs(4) up to --radius-full(100px) (tokens.css:83-90).
- Observed: 100px for pill buttons (.btn border-radius:100px buttons.css:8), hero-cta-play 100px (hero.css:381), chip radius-full (primitives.css:127), glass-popover border-radius 22px/18px (primitives.css:12,33), modal/dialog radii vary (modals.css).
- Many components use Tailwind rounded-* or inline borderRadius (Loader.jsx uses 50% for circles).

Token debt (evidence):
- 560 hex literals outside tokens.css vs 381 var(--*) uses; 931 rgba hardcoded non-var (indicative of under-tokenized surfaces).
- Player chrome defines its own CSS variables in player.css (--zxc-*, --np-*, --hud-*, etc.) creating parallel token set (player.css extensive).
- Hero.css and other styles duplicate values (backdrop-filter blur values repeated).
- Inline styles in large pages (HomePage.jsx, TitleDetailsPage.jsx) reduce consistency.


## E. Loading/empty/error consistency

Spinners/Loaders:
- Loader.jsx: universal component with variants page/inline/button/global; uses SVG dual-ring + animated center dot, gradient-aware; uses keyframes loader-dash/loader-spin-ccw/loader-pulse-center/loader-fade-in (styles in ui-kit.css:234-250).
- RingSpinner exported from player/chrome/primitives.jsx:176 as .np-tailspin (CSS in player.css:618-644) — player-specific Tailspin ring.
- Loader2 imported only in VerifyEmailPage.jsx:4,117 (lucide-react Loader2) — single use case.
- Tailspin CSS present (player.css) but no exported Tailspin component; tests reference .np-tailspin (nativePlayerView.test.jsx).
- RatingsTable uses Tailwind animate-spin class (RatingsTable.jsx:158) — separate spinner style.
- SettingsPage uses lucide-react RotateCcw with animate-spin (SettingsPage.jsx:613).

Skeletons:
- .skeleton + shimmer-wave + stagger delays (skeleton.css:1-232)
- MovieDetailsSkeleton.jsx (224 lines) — bespoke skeleton for details page
- Pages render skeleton-hero, skeleton-rail, skeleton-moviecard as needed (HomePage.jsx:884-938, 1245-1259)

Empty states:
- EmptyState.jsx component (37 lines) exists; used in SearchPage.jsx:434,462,473,498 (per grep). Other pages implement custom empty states (Home fallback at 1160-1203, Watchlist/History have custom markup).

Error handling:
- ErrorBoundary.jsx (152 lines) wraps key sections (Home hero 940, rails 1214,1226,1269,1288...). Pages also log via debugLogger and show retry CTAs.

Inconsistencies: multiple spinner implementations (SVG Loader, Tailspin RingSpinner for player, lucide Loader2, animate-spin classes), mixed empty-state styles (shared EmptyState vs custom), skeleton sets vary by surface.


## F. Accessibility baseline

Findings:
- aria-label usage: 134 occurrences across src jsx/js; 0 empty aria-label=" (per scan). Many icon-only buttons have aria-label (e.g. hero secondary icons 1115,1125; RailArrow has aria-label usage patterns).
- Buttons: 155 <button> total (65 components/, 74 pages/).
- Icon-only affordances: hero action pill contains two icon buttons separated by | (1120 aria-hidden on separator). RailArrow renders buttons (38 lines). Various icon buttons exist in player chrome (IconBtn component).
- Focus-visible: styles present (.head-menu-item:focus-visible primitives.css:55-59, .chip:focus-visible 141-146, .ratings-refresh:focus-visible 173-177). Global focus ring not uniformly enforced across all button variants in CSS?
- Heading order: pages use h1/h2/h3 (Home has h2 section-title 1238; Search hero h1 305; TitleDetails structure varies). Needs verification per page, but structure exists.
- Reduced motion: prefers-reduced-motion respected (buttons.css:160-166 for badge ring; Home uses useReducedMotion for hero hover/animations; global CSS reduces animations in html[data-reduce-motion] and * rules in tokens.css 186-197). Framer Motion uses useReducedMotion in components (Button.jsx:16,26-27, Chip.jsx:15,21-23).
- Touch targets: touch-action: manipulation set globally (tokens.css:207-210); min heights implied by padding.
- Alt text: img elements have alt attributes (Home hero backdrop 986).

Gaps: some decorative elements use aria-hidden (separator 1120). No obvious mass of empty aria-labels. Icon-only buttons generally labeled where needed (hero icons labeled). Need to spot unlabeled icon-only buttons in dense player chrome.


## G. Ranked Top-5 decluttering opportunities (effort vs impact, files touched, risk)

Rank 1:
- Title: Consolidate button system to single source (remove near-duplicates)
- Why: Many variants (.btn-*, .np-*, hero-cta-*, pill classes) create inconsistent weights/radii/active states; active chip moved to white CTA style recently but others remain.
- Files: src/styles/buttons.css, src/styles/ui-kit.css, src/styles/primitives.css, src/styles/hero.css, src/styles/player.css, src/components/Button.jsx
- Effort: Medium (refactor classes, update usages)
- Impact: High (visual unity)
- Risk: Medium (touches many surfaces)
- Concrete: Replace .btn-theaters/.btn-trailer special cases with semantic variants; align hero CTAs to use Button component where possible; deprecate .np- button classes or map to shared.

Rank 2:
- Title: Tokenize rgba/hex (reduce hardcoded colors)
- Why: 560 hex outside tokens.css, 931 rgba non-var indicate token debt.
- Files: src/styles/*.css (player.css, modals.css, settings-ui.css largest), src/pages/HomePage.jsx, TitleDetailsPage.jsx (inline colors)
- Effort: Medium
- Impact: High
- Risk: Low-Medium
- Concrete: Add missing color tokens (surfaces/borders/text states), replace frequent rgba values with CSS vars.

Rank 3:
- Title: Unify spinners/skeletons/empty states
- Why: 3+ spinner styles (Loader, RingSpinner/Tailspin, Loader2, animate-spin), EmptyState underused vs custom, MovieDetailsSkeleton bespoke.
- Files: src/components/Loader.jsx, src/components/player/chrome/primitives.jsx, src/components/EmptyState.jsx, src/styles/skeleton.css, pages using custom empty/skeleton
- Effort: Low-Medium
- Impact: Medium-High
- Risk: Low
- Concrete: Standardize on Loader variants; prefer EmptyState for empty lists; extract shared skeleton primitives.

Rank 4:
- Title: Reduce hero/details density (meta duplication)
- Why: Home hero meta row duplicates facts; TitleDetails hero + info blocks repeat year/rating/runtime; competing focal stacks.
- Files: src/pages/HomePage.jsx (1053-1076), src/pages/TitleDetailsPage.jsx (hero/meta blocks), src/components/RatingsCluster.jsx
- Effort: Low-Medium
- Impact: High (readability)
- Risk: Low
- Concrete: Collapse duplicate meta into single source; simplify hero CTAs (single primary + secondary group) to reduce stack.

Rank 5:
- Title: Consolidate pill/chip variants
- Why: PillAction constants, .chip, .search-chippill, .seed-pill, .login-tab-pill create overlapping surfaces.
- Files: src/components/Chip.jsx, src/components/browse/PillAction.jsx, src/styles/primitives.css, search.css, settings-ui.css, discovery.css
- Effort: Low-Medium
- Impact: Medium
- Risk: Low
- Concrete: Unify on Chip component + .chip styles; migrate others to shared primitive.



--- End of audit (RESEARCH ONLY) ---

