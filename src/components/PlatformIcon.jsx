import React from "react";
import { PLATFORMS, normalizePlatformKey } from "../api/platformAdapter";

/**
 * PlatformIcon — renders a platform logo or branded fallback badge.
 *
 * Props:
 *   platform  — raw or canonical platform string
 *   small     — smaller sizing
 *   xs        — extra-small sizing
 *   size      — explicit square pixel size (e.g. 80 for browse grid)
 *   pill      — render as a pill with name + icon
 *   showName  — show platform name next to icon
 *   style     — additional inline styles
 */
export default function PlatformIcon({
  platform,
  style = {},
  small = false,
  xs = false,
  size,
  pill = false,
}) {
  if (!platform) return null;

  const key = normalizePlatformKey(platform);
  const p = key ? PLATFORMS[key] : null;

  // ── Branded fallback: first-letter badge with brand color ──
  if (!p) {
    const fallbackChar = String(platform).charAt(0).toUpperCase();
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: xs ? "18px" : small ? "22px" : "28px",
          height: xs ? "18px" : small ? "22px" : "28px",
          borderRadius: "6px",
          background: "rgba(255,255,255,0.12)",
          fontSize: xs ? "0.5rem" : small ? "0.6rem" : "0.7rem",
          fontWeight: 800,
          color: "#f4f4f5",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          flexShrink: 0,
          ...style,
        }}
        title={String(platform)}
      >
        {fallbackChar}
      </div>
    );
  }

  // ── Pill mode: icon + name badge ──
  if (pill) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: xs ? "2px 6px" : small ? "3px 8px" : "4px 10px",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "100px",
          ...style,
        }}
      >
        <img
          src={p.iconUrl}
          alt={p.name}
          style={{
            height: xs ? `calc(${p.iconHeight} * 0.7)` : small ? `calc(${p.iconHeight} * 0.85)` : p.iconHeight,
            objectFit: "contain",
            filter: p.iconFilter
              ? `${p.iconFilter} drop-shadow(0 1px 2px rgba(0,0,0,0.5))`
              : "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
          }}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.target.style.display = "none";
            if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
          }}
        />
        <span
          style={{
            display: "none",
            width: xs ? "14px" : small ? "18px" : "22px",
            height: xs ? "14px" : small ? "18px" : "22px",
            borderRadius: "4px",
            background: p.gradient || p.color,
            alignItems: "center",
            justifyContent: "center",
            fontSize: xs ? "0.45rem" : "0.5rem",
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {p.shortName.charAt(0)}
        </span>
        <span
          style={{
            fontSize: xs ? "0.6rem" : small ? "0.7rem" : "0.8rem",
            fontWeight: 600,
            color: "#d4d4d8",
            whiteSpace: "nowrap",
          }}
        >
          {p.shortName}
        </span>
      </div>
    );
  }

  // ── Icon-only mode (default) ──
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <img
        src={p.iconUrl}
        alt={p.name}
        title={p.name}
        style={{
          width: size || "auto",
          height: size
            ? `${size}px`
            : xs
              ? `calc(${p.iconHeight} * 0.62)`
              : small
                ? `calc(${p.iconHeight} * 0.85)`
                : p.iconHeight,
          borderRadius: size ? "12px" : undefined,
          objectFit: "contain",
          filter: p.iconFilter
            ? `${p.iconFilter} drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
            : "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
          transition: "filter 0.2s",
        }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          // Replace with branded gradient badge on image load failure
          const parent = e.target.parentElement;
          if (parent && !parent.querySelector('.platform-fallback-badge')) {
            e.target.style.display = "none";
            const badge = document.createElement('div');
            const bSize = size ? `${size}px` : xs ? '18px' : small ? '24px' : '32px';
            const bFont = size ? `${Math.round(size * 0.4)}px` : xs ? '0.5rem' : small ? '0.6rem' : '0.75rem';
            badge.className = 'platform-fallback-badge';
            badge.style.cssText = `
              display: flex; align-items: center; justify-content: center;
              width: ${bSize}; height: ${bSize};
              border-radius: ${size ? '12px' : '6px'};
              background: ${p.gradient || p.color};
              font-size: ${bFont};
              font-weight: 800; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.3);
              flex-shrink: 0;
            `;
            badge.textContent = p.shortName.charAt(0);
            badge.title = p.name;
            parent.appendChild(badge);
          }
        }}
      />
    </div>
  );
}

/**
 * MultiPlatformBadges — renders multiple platform icons in a row.
 * Used in details pages and notification footers.
 */
export function MultiPlatformBadges({ platforms = [], size = "sm", maxDisplay = 4 }) {
  const displayed = platforms.slice(0, maxDisplay);
  const overflow = platforms.length - maxDisplay;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
      {displayed.map((p) => {
        const key = typeof p === "string" ? normalizePlatformKey(p) : p;
        if (!key) return null;
        return (
          <div
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 6px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
            }}
          >
            <PlatformIcon platform={key} small={size === "sm"} xs={size === "xs"} />
          </div>
        );
      })}
      {overflow > 0 && (
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "#71717a",
            padding: "2px 6px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "6px",
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
