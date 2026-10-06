// Player chrome iconography.
//
// A from-scratch SVG set that replaces the mixed lucide glyphs the old chrome
// used. Apple TV+ reads as one hand: thin uniform strokes, rounded caps, a
// circular "10" for the skip controls, and plain white glyphs rather than
// filled plates. Everything is drawn on a 24x24 grid and inherits `currentColor`
// so the theme can drive it.
//
// Only the a11y contract matters to the tests (aria-labels, roles, class names),
// so the drawings are free to change — the buttons that wrap these keep their
// accessible names.

function Base({ size = 24, strokeWidth = 1.7, children, ...rest }) {
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

// Filled triangle, optically nudged right so it reads centred in a circle.
export function IconPlay({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.4-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z" fill="currentColor" transform="translate(1.4 0)" />
    </Base>
  );
}

export function IconPause({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <rect x="6.6" y="4.8" width="4" height="14.4" rx="1.6" fill="currentColor" />
      <rect x="13.4" y="4.8" width="4" height="14.4" rx="1.6" fill="currentColor" />
    </Base>
  );
}

// Counter-clockwise ring with a "10" — the skip-back control.
export function IconSkipBack10({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M3.5 4v5.2h5.2" />
      <path d="M4.2 9.2a8.6 8.6 0 1 1-1.4 4.4" transform="translate(1.2 1.2)" />
      <text
        x="13"
        y="15.4"
        textAnchor="middle"
        fontSize="7.2"
        fontWeight="700"
        letterSpacing="-0.4"
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        10
      </text>
    </Base>
  );
}

// Clockwise ring with a "10" — the skip-forward control.
export function IconSkipForward10({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M20.5 4v5.2h-5.2" />
      <path d="M19.8 9.2a8.6 8.6 0 1 0 1.4 4.4" transform="translate(-1.2 1.2)" />
      <text
        x="11"
        y="15.4"
        textAnchor="middle"
        fontSize="7.2"
        fontWeight="700"
        letterSpacing="-0.4"
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        10
      </text>
    </Base>
  );
}

// Circular arrow for the end-of-title "Watch again" action.
export function IconReplay({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M3.5 4v5.2h5.2" />
      <path d="M4.2 9.2a8.6 8.6 0 1 1-1.4 4.4" transform="translate(1.2 1.2)" />
      <path d="M10 9.2l6.4 3.8L10 16.8Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

/* Utility ------------------------------------------------------------------ */

export function IconCaptions({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <rect x="3" y="5" width="18" height="14" rx="3.6" />
      <path d="M9.4 10.4a2.1 2.1 0 0 0-3 1.7 2.1 2.1 0 0 0 3 1.7" />
      <path d="M17.4 10.4a2.1 2.1 0 0 0-3 1.7 2.1 2.1 0 0 0 3 1.7" />
    </Base>
  );
}

export function IconAudio({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M4 10v4" />
      <path d="M8 7v10" />
      <path d="M12 4v16" />
      <path d="M16 7v10" />
      <path d="M20 10v4" />
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

export function IconSettings({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.4 7.3l1.9 1.1M17.7 15.6l1.9 1.1M4.4 16.7l1.9-1.1M17.7 8.4l1.9-1.1" />
      <circle cx="12" cy="12" r="8.6" strokeDasharray="1.6 3.1" />
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
    <Base size={size} {...rest}>
      <path d="M8.5 3.5H5.6A2.1 2.1 0 0 0 3.5 5.6v2.9" />
      <path d="M15.5 3.5h2.9a2.1 2.1 0 0 1 2.1 2.1v2.9" />
      <path d="M8.5 20.5H5.6a2.1 2.1 0 0 1-2.1-2.1v-2.9" />
      <path d="M15.5 20.5h2.9a2.1 2.1 0 0 0 2.1-2.1v-2.9" />
    </Base>
  );
}

export function IconFullscreenExit({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M8.5 3.5v2.9a2.1 2.1 0 0 1-2.1 2.1H3.5" />
      <path d="M15.5 3.5v2.9a2.1 2.1 0 0 0 2.1 2.1h2.9" />
      <path d="M8.5 20.5v-2.9a2.1 2.1 0 0 0-2.1-2.1H3.5" />
      <path d="M15.5 20.5v-2.9a2.1 2.1 0 0 1 2.1-2.1h2.9" />
    </Base>
  );
}

/* Volume ------------------------------------------------------------------- */

const SPEAKER_BODY = "M4 9.2v5.6h3.1L12 18.6V5.4L7.1 9.2H4Z";

export function IconVolumeHigh({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d={SPEAKER_BODY} fill="currentColor" stroke="none" />
      <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18 6.6a7.6 7.6 0 0 1 0 10.8" />
    </Base>
  );
}

export function IconVolumeLow({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d={SPEAKER_BODY} fill="currentColor" stroke="none" />
      <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
    </Base>
  );
}

export function IconVolumeMute({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d={SPEAKER_BODY} fill="currentColor" stroke="none" />
      <path d="M16 9.6l5 4.8M21 9.6l-5 4.8" />
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
      <path d="M4 8h9M18.4 8H20M4 16h5M14.4 16H20" />
      <circle cx="15.2" cy="8" r="2.4" />
      <circle cx="11.2" cy="16" r="2.4" />
    </Base>
  );
}

export function IconGauge({ size = 24, ...rest }) {
  return (
    <Base size={size} {...rest}>
      <path d="M12 13.4l3.6-3.6" />
      <path d="M5.4 18.4a8.4 8.4 0 1 1 13.2 0" />
      <circle cx="12" cy="13.4" r="1.5" fill="currentColor" stroke="none" />
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