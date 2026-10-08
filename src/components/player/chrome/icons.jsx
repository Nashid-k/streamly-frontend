// Player chrome iconography — YouTube-style (NEW PLAYER UI-UX.html, 2026-10-08).
//
// From-scratch SVG set. The design draws every control on a 24x24 grid with
// 2px uniform strokes, rounded caps/joins, and a few filled glyphs: the play
// triangle, pause bars, speaker body, skip wedges. Everything inherits
// `currentColor` so the theme can drive it.
//
// Only the a11y contract matters to the tests (aria-labels, roles, class names),
// so the drawings are free to change — the buttons that wrap these keep their
// accessible names.

function Base({ size = 24, strokeWidth = 2, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* Transport ---------------------------------------------------------------- */

// Filled triangle, the design's play glyph.
export function IconPlay({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path d="M8 5.2v13.6a.9.9 0 0 0 1.38.77L19.2 12.8a.9.9 0 0 0 0-1.55L9.38 4.44A.9.9 0 0 0 8 5.2Z" fill="currentColor" />
    </Base>
  );
}

export function IconPause({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <rect x="6.2" y="4.9" width="4.2" height="14.2" rx="1.5" fill="currentColor" />
      <rect x="13.6" y="4.9" width="4.2" height="14.2" rx="1.5" fill="currentColor" />
    </Base>
  );
}

// Lucide-style skip wedges (filled triangle + bar): clear at 22-30px, keep the
// ring+10 out of the bottom bar so the chrome reads tighter.
export function IconSkipBack10({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path d="M19 20 9.5 12l9.5-8v16Z" fill="currentColor" />
      <path d="M5.5 4.5v15" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </Base>
  );
}

export function IconSkipForward10({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path d="M5 20l9.5-8-9.5-8v16Z" fill="currentColor" />
      <path d="M18.5 4.5v15" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </Base>
  );
}

// Circular arrow for the end-of-title "Watch again" action.
export function IconReplay({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M4 4v5.2h5.2" />
      <path d="M4.1 9.2a8.4 8.4 0 1 1-1.1 4" />
      <path d="M10 9.4l6.2 3.7-6.2 3.7Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

/* Utility ------------------------------------------------------------------ */

export function IconCaptions({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" />
    </Base>
  );
}

// Audio track: speaker fanning to the right — the design's audio-track glyph.
export function IconAudio({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M4 9.6v4.8h2.8l4 3.6V6l-4 3.6H4Z" />
      <path d="M16.4 7.8a5.2 5.2 0 0 1 0 8.4" />
      <path d="M19 4.8a9.2 9.2 0 0 1 0 14.4" />
    </Base>
  );
}

export function IconServers({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <rect x="3" y="4" width="18" height="6.4" rx="2.4" />
      <rect x="3" y="13.6" width="18" height="6.4" rx="2.4" />
      <path d="M7 7.2h.01M7 16.8h.01" />
    </Base>
  );
}

// Filled gear from the YouTube design (NEW PLAYER UI-UX.html).
export function IconSettings({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path
        d="M12 9.5c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5-2.5-1.12-2.5-2.5 1.12-2.5 2.5-2.5m0-1c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zM13.22 3l.55 2.2.13.51.5.18c.61.23 1.19.56 1.72.98l.4.32.5-.14 2.17-.62 1.22 2.11-1.63 1.59-.37.36.08.51c.05.32.08.64.08.98s-.03.66-.08.98l-.08.51.37.36 1.63 1.59-1.22 2.11-2.17-.62-.5-.14-.4.32c-.53.43-1.11.76-1.72.98l-.5.18-.13.51-.55 2.24h-2.44l-.55-2.2-.13-.51-.5-.18c-.6-.23-1.18-.56-1.72-.99l-.4-.32-.5.14-2.17.62-1.21-2.12 1.63-1.59.37-.36-.08-.51c-.05-.32-.08-.65-.08-.98s.03-.66.08-.98l.08-.51-.37-.36L3.6 8.56l1.22-2.11 2.17.62.5.14.4-.32c.53-.44 1.11-.77 1.72-.99l.5-.18.13-.51.55-2.21h2.43M14 2h-4l-.74 2.96c-.73.27-1.4.66-2 1.14l-2.92-.83-2 3.46 2.19 2.13c-.06.37-.09.75-.09 1.14s.03.77.09 1.14l-2.19 2.13 2 3.46 2.92-.83c.6.48 1.27.87 2 1.14L10 22h4l.74-2.96c.73-.27 1.4-.66 2-1.14l2.92.83 2-3.46-2.19-2.13c.06-.37.09-.75.09-1.14s-.03-.77-.09-1.14l2.19-2.13-2-3.46-2.92.83c-.6-.48-1.27-.87-2-1.14L14 2z"
        fill="currentColor"
      />
    </Base>
  );
}

export function IconEpisodes({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <rect x="3" y="5" width="18" height="14" rx="3.4" />
      <path d="M10.4 9.4l4.6 2.6-4.6 2.6Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconFullscreen({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M14 10l7-7M16 3h5v5M10 14l-7 7M3 16v5h5" />
    </Base>
  );
}

export function IconFullscreenExit({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M3 3l7 7M10 5v5H5M21 21l-7-7M14 19v-5h5" />
    </Base>
  );
}

// Aspect-corrected frame enlarge, the design's "theater" glyph.
export function IconTheater({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M9.5 9.5l-2.5 2.5 2.5 2.5M14.5 9.5l2.5 2.5-2.5 2.5" />
    </Base>
  );
}

export function IconInfo({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2" />
      <path d="M12 7.6h.01" />
    </Base>
  );
}

/* Volume ------------------------------------------------------------------- */

// Filled speaker body matching the design, open strokes for the waves.
const SPEAKER_BODY = "M3 9v6h4l5 5V4L7 9z";

export function IconVolumeHigh({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2} {...rest}>
      <path d={SPEAKER_BODY} fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" />
      <path d="M18 5.5a9 9 0 0 1 0 13" fill="none" />
    </Base>
  );
}

export function IconVolumeLow({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2} {...rest}>
      <path d={SPEAKER_BODY} fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" />
    </Base>
  );
}

export function IconVolumeMute({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2} {...rest}>
      <path d={SPEAKER_BODY} fill="currentColor" stroke="none" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" />
    </Base>
  );
}

/* Navigation --------------------------------------------------------------- */

export function IconChevronLeft({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Base>
  );
}

export function IconChevronRight({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Base>
  );
}

export function IconArrowLeft({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M19 12H5.5" />
      <path d="M11.5 6 5.5 12l6 6" />
    </Base>
  );
}

export function IconClose({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" />
    </Base>
  );
}

export function IconCheck({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M4.5 12.6 9.5 17.6 19.5 6.4" />
    </Base>
  );
}

export function IconCalendar({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <rect x="3.5" y="5" width="17" height="15" rx="3.4" />
      <path d="M3.5 9.6h17M8 3.2v3.6M16 3.2v3.6" />
    </Base>
  );
}

/* Settings sub-panel glyphs ------------------------------------------------ */

export function IconSliders({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M3 7h10M17 7h4M3 17h4M11 17h10" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </Base>
  );
}

// Playback speed reads as a speedometer, matching NEW PLAYER UI-UX.html.
export function IconGauge({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M4 18a9 9 0 1 1 16 0M12 14l5-5" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconAspect({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M7 3.5v13.5a2 2 0 0 0 2 2h12" />
      <path d="M3.5 7H17a2 2 0 0 1 2 2v13.5" />
    </Base>
  );
}

export function IconSun({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.6v2.3M12 19.1v2.3M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M2.6 12h2.3M19.1 12h2.3M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6" />
    </Base>
  );
}

export function IconChevronsRight({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M6.5 6 12.5 12l-6 6" />
      <path d="M13 6l6 6-6 6" />
    </Base>
  );
}

export function IconStop({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <circle cx="12" cy="12" r="8.4" />
      <rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1" fill="currentColor" stroke="none" />
    </Base>
  );
}