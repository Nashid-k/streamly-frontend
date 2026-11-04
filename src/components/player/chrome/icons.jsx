// Player chrome iconography — v4 design system
// Every control corresponds to symbols defined in player-v4.html
// 24x24 viewBox, stroke-width 2.2 round cap/join, or exact filled paths.

function Base({ size = 24, strokeWidth = 2.2, children, ...rest }) {
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

// Filled triangle (#i-play)
export function IconPlay({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path fill="currentColor" stroke="none" d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
    </Base>
  );
}

// Pause bars (#i-pause)
export function IconPause({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <g fill="currentColor" stroke="none">
        <rect x="5" y="3.5" width="5" height="17" rx="1" />
        <rect x="14" y="3.5" width="5" height="17" rx="1" />
      </g>
    </Base>
  );
}

// Chevron rewind (#i-rew)
export function IconSkipBack10({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.8} {...rest}>
      <path d="m15 5-7 7 7 7" />
    </Base>
  );
}

// Chevron forward (#i-fwd)
export function IconSkipForward10({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.8} {...rest}>
      <path d="m9 5 7 7-7 7" />
    </Base>
  );
}

export function IconReplay({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M4 4v5.2h5.2" />
      <path d="M4.1 9.2a8.4 8.4 0 1 1-1.1 4" />
      <path d="M10 9.4l6.2 3.7-6.2 3.7Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

/* Utility ------------------------------------------------------------------ */

// Captions (#i-subs)
export function IconCaptions({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path fill="currentColor" stroke="none" fillRule="evenodd" d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4zM5.5 12a1 1 0 0 0 0 2H10a1 1 0 0 0 0-2H5.5zm7.5 0a1 1 0 0 0 0 2h5.5a1 1 0 0 0 0-2H13zM5.5 15.8a1 1 0 0 0 0 2h7a1 1 0 0 0 0-2h-7zm9.5 0a1 1 0 0 0 0 2h3.5a1 1 0 0 0 0-2H15z" />
    </Base>
  );
}

// Audio track
export function IconAudio({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path fill="currentColor" stroke="none" d="M3 9.5v5h3.8l5.2 4.5V5L6.8 9.5H3z" />
      <path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8M17.8 5.9a8.6 8.6 0 0 1 0 12.2" />
    </Base>
  );
}

export function IconServers({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <rect x="3" y="4" width="18" height="6.4" rx="2.4" />
      <rect x="3" y="13.6" width="18" height="6.4" rx="2.4" />
      <path d="M7 7.2h.01M7 16.8h.01" />
    </Base>
  );
}

// Gear (#i-gear)
export function IconSettings({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path
        fill="currentColor"
        stroke="none"
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
      />
    </Base>
  );
}

// Episodes (#i-ep)
export function IconEpisodes({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M6.5 8V6.5A2.5 2.5 0 0 1 9 4h11a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-1.5" />
      <rect x="1.8" y="8" width="17" height="12" rx="2.5" />
    </Base>
  );
}

// Fullscreen (#i-fs)
export function IconFullscreen({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M3.5 9V4.5H8M16 4.5h4.5V9M20.5 15v4.5H16M8 19.5H3.5V15" />
    </Base>
  );
}

// Fullscreen exit (#i-fsx)
export function IconFullscreenExit({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M8 3.5V8H3.5M16 3.5V8h4.5M16 20.5V16h4.5M8 20.5V16H3.5" />
    </Base>
  );
}

// Picture in picture (#i-pip)
export function IconPip({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path fill="currentColor" stroke="none" fillRule="evenodd" d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4zm.5 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5z" />
      <rect fill="currentColor" stroke="none" x="11.5" y="8.5" width="6.5" height="4.5" rx=".8" />
    </Base>
  );
}

// Menu check (#i-check)
export function IconMenuCheck({ size = 24, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="ic ck"
      {...rest}
    >
      <circle cx="12" cy="12" r="11" fill="var(--accent)" stroke="none" />
      <path d="m7 12.5 3.5 3.5 6.5-7.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTheater({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M9.5 9.5l-2.5 2.5 2.5 2.5M14.5 9.5l2.5 2.5-2.5 2.5" />
    </Base>
  );
}

export function IconInfo({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2" />
      <path d="M12 7.6h.01" />
    </Base>
  );
}

/* Volume (#i-vol / #i-mute) ------------------------------------------------ */

export function IconVolumeHigh({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path fill="currentColor" stroke="none" d="M3 9.5v5h3.8l5.2 4.5V5L6.8 9.5H3z" />
      <path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8M17.8 5.9a8.6 8.6 0 0 1 0 12.2" />
    </Base>
  );
}

export function IconVolumeLow({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path fill="currentColor" stroke="none" d="M3 9.5v5h3.8l5.2 4.5V5L6.8 9.5H3z" />
      <path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8" />
    </Base>
  );
}

export function IconVolumeMute({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path fill="currentColor" stroke="none" d="M3 9.5v5h3.8l5.2 4.5V5L6.8 9.5H3z" />
      <path d="m15.5 9.5 5 5m0-5-5 5" />
    </Base>
  );
}

/* Navigation --------------------------------------------------------------- */

export function IconChevronLeft({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="m15 19-7-7 7-7" />
    </Base>
  );
}

export function IconChevronRight({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="m9 5 7 7-7 7" />
    </Base>
  );
}

export function IconArrowLeft({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M15 4 7 12l8 8" />
    </Base>
  );
}

export function IconClose({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function IconCheck({ size = 24, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="ic ck"
      {...rest}
    >
      <circle cx="12" cy="12" r="11" fill="var(--accent)" stroke="none" />
      <path d="m7 12.5 3.5 3.5 6.5-7.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCalendar({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <rect x="3.5" y="5" width="17" height="15" rx="3.4" />
      <path d="M3.5 9.6h17M8 3.2v3.6M16 3.2v3.6" />
    </Base>
  );
}

/* Settings sub-panel glyphs ------------------------------------------------ */

export function IconSliders({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M3 7h10M17 7h4M3 17h4M11 17h10" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </Base>
  );
}

export function IconGauge({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M4 18a9 9 0 1 1 16 0M12 14l5-5" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconAspect({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="M7 3.5v13.5a2 2 0 0 0 2 2h12" />
      <path d="M3.5 7H17a2 2 0 0 1 2 2v13.5" />
    </Base>
  );
}

export function IconSun({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </Base>
  );
}

export function IconChevronsRight({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="m6.5 6 6 6-6 6" />
      <path d="m13 6 6 6-6 6" />
    </Base>
  );
}

export function IconStop({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <circle cx="12" cy="12" r="8.4" />
      <rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1" fill="currentColor" stroke="none" />
    </Base>
  );
}
