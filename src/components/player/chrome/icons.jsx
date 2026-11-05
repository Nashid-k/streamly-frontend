// Player chrome iconography — v4 design system
// Only the icons actually consumed by the chrome are kept here; the rest of
// the v4 symbol set was unused and has been removed. Add new icons sparingly
// and only when a caller imports them — dead iconography bit-rotted for months.
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

// Filled triangle (#i-play)
export function IconPlay({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path fill="currentColor" stroke="none" d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
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

export function IconChevronsRight({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={2.2} {...rest}>
      <path d="m6.5 6 6 6-6 6" />
      <path d="m13 6 6 6-6 6" />
    </Base>
  );
}

export function IconCaptions({ size = 24, ...rest }) {
  return (
    <Base size={size} strokeWidth={0} {...rest}>
      <path fill="currentColor" stroke="none" fillRule="evenodd" d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4zM5.5 12a1 1 0 0 0 0 2H10a1 1 0 0 0 0-2H5.5zm7.5 0a1 1 0 0 0 0 2h5.5a1 1 0 0 0 0-2H13zM5.5 15.8a1 1 0 0 0 0 2h7a1 1 0 0 0 0-2h-7zm9.5 0a1 1 0 0 0 0 2h3.5a1 1 0 0 0 0-2H15z" />
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
