// Exact SVG Symbol sprite from player-v4.html
// Provides pixel-perfect vector definitions for all icons:
// play, pause, back, rew, fwd, vol, mute, ep, pip, subs, gear, fs, fsx, chev, sun, x, check
export default function PlayerSvgSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", display: "none" }} aria-hidden="true">
      <defs>
        <symbol id="i-play" viewBox="0 0 24 24">
          <path fill="currentColor" stroke="none" d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
        </symbol>
        <symbol id="i-pause" viewBox="0 0 24 24">
          <g fill="currentColor" stroke="none">
            <rect x="5" y="3.5" width="5" height="17" rx="1" />
            <rect x="14" y="3.5" width="5" height="17" rx="1" />
          </g>
        </symbol>
        <symbol id="i-back" viewBox="0 0 24 24">
          <path d="M15 4 7 12l8 8" />
        </symbol>
        <symbol id="i-rew" viewBox="0 0 24 24">
          <path strokeWidth="2.8" d="m15 5-7 7 7 7" />
        </symbol>
        <symbol id="i-fwd" viewBox="0 0 24 24">
          <path strokeWidth="2.8" d="m9 5 7 7-7 7" />
        </symbol>
        <symbol id="i-vol" viewBox="0 0 24 24">
          <path fill="currentColor" stroke="none" d="M3 9.5v5h3.8l5.2 4.5V5L6.8 9.5H3z" />
          <path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8M17.8 5.9a8.6 8.6 0 0 1 0 12.2" />
        </symbol>
        <symbol id="i-mute" viewBox="0 0 24 24">
          <path fill="currentColor" stroke="none" d="M3 9.5v5h3.8l5.2 4.5V5L6.8 9.5H3z" />
          <path d="m15.5 9.5 5 5m0-5-5 5" />
        </symbol>
        <symbol id="i-ep" viewBox="0 0 24 24">
          <path d="M6.5 8V6.5A2.5 2.5 0 0 1 9 4h11a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-1.5" />
          <rect x="1.8" y="8" width="17" height="12" rx="2.5" />
        </symbol>
        <symbol id="i-pip" viewBox="0 0 24 24">
          <path fill="currentColor" stroke="none" fillRule="evenodd" d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4zm.5 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5z" />
          <rect fill="currentColor" stroke="none" x="11.5" y="8.5" width="6.5" height="4.5" rx=".8" />
        </symbol>
        <symbol id="i-subs" viewBox="0 0 24 24">
          <path fill="currentColor" stroke="none" fillRule="evenodd" d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4zM5.5 12a1 1 0 0 0 0 2H10a1 1 0 0 0 0-2H5.5zm7.5 0a1 1 0 0 0 0 2h5.5a1 1 0 0 0 0-2H13zM5.5 15.8a1 1 0 0 0 0 2h7a1 1 0 0 0 0-2h-7zm9.5 0a1 1 0 0 0 0 2h3.5a1 1 0 0 0 0-2H15z" />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 24 24">
          <path fill="currentColor" stroke="none" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </symbol>
        <symbol id="i-fs" viewBox="0 0 24 24">
          <path d="M3.5 9V4.5H8M16 4.5h4.5V9M20.5 15v4.5H16M8 19.5H3.5V15" />
        </symbol>
        <symbol id="i-fsx" viewBox="0 0 24 24">
          <path d="M8 3.5V8H3.5M16 3.5V8h4.5M16 20.5V16h4.5M8 20.5V16H3.5" />
        </symbol>
        <symbol id="i-chev" viewBox="0 0 24 24">
          <path d="m9 5 7 7-7 7" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6 6 18" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="var(--accent)" stroke="none" />
          <path d="m7 12.5 3.5 3.5 6.5-7.5" stroke="#fff" strokeWidth="2.4" />
        </symbol>
      </defs>
    </svg>
  );
}
