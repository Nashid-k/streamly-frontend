import { useState } from "react";

/* Country flag with an offline-safe fallback: if the local SVG can't load we
   swap in a tiny letter chip instead of a broken-image box. External flag
   CDNs are unreliable behind blocking ISPs, so the flags ship with the app. */
function LanguageFlag({ src, code, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-[3px] bg-white/10 text-[8px] font-bold tracking-wide text-white/80 ${className}`}
        aria-hidden="true"
      >
        {code.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      alt=""
      className={className}
      src={src}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default LanguageFlag;