import { useCallback, useState } from "react";
import { DEFAULT_V4_ACCENT } from "../chrome/theme";
import { hexToRgbTriplet } from "../../../utils/color";

const STORAGE_ACCENT = "streamly_player_v4_accent";
const STORAGE_IS = "streamly_player_v4_is";
const STORAGE_CC = "streamly_player_v4_cc";
const STORAGE_CB = "streamly_player_v4_cb";

export default function usePlayerV4Appearance({
  subtitleSize,
  setSubtitleBg,
  initialSubColor,
} = {}) {
  const [accent, setAccentState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_ACCENT) || DEFAULT_V4_ACCENT;
    } catch {
      return DEFAULT_V4_ACCENT;
    }
  });

  const [iconSize, setIconSizeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_IS);
      return stored ? parseFloat(stored) : 1;
    } catch {
      return 1;
    }
  });

  const [subColorOverride, setSubColorOverride] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_CC);
    } catch {
      return null;
    }
  });

  const subColor = subColorOverride || initialSubColor || "var(--white)";

  const [subBgStyle, setSubBgStyleState] = useState(() => {
    try {
      const v4 = localStorage.getItem(STORAGE_CB);
      if (v4 && ["shadow", "box", "outline"].includes(v4)) return v4;
      const legacy = localStorage.getItem("streamly_subtitle_bg");
      if (legacy === "2") return "box";
      if (legacy === "3") return "outline";
      return "shadow";
    } catch {
      return "shadow";
    }
  });

  const setAccent = useCallback((val) => {
    setAccentState(val);
    try {
      localStorage.setItem(STORAGE_ACCENT, val);
    } catch {
      /* ignore storage failure */
    }
  }, []);

  const setIconSize = useCallback((val) => {
    const num = Math.min(2.2, Math.max(0.5, parseFloat(val) || 1));
    setIconSizeState(num);
    try {
      localStorage.setItem(STORAGE_IS, num.toString());
    } catch {
      /* ignore storage failure */
    }
  }, []);

  const setSubColor = useCallback((val) => {
    setSubColorOverride(val);
    try {
      localStorage.setItem(STORAGE_CC, val);
    } catch {
      /* ignore storage failure */
    }
  }, []);

  const setSubBgStyle = useCallback((style) => {
    setSubBgStyleState(style);
    try {
      localStorage.setItem(STORAGE_CB, style);
    } catch {
      /* ignore storage failure */
    }
    if (setSubtitleBg) {
      if (style === "box") setSubtitleBg(2);
      else if (style === "outline") setSubtitleBg(3);
      else setSubtitleBg(1);
    }
  }, [setSubtitleBg]);

  // cz scale calculation
  const czValues = [0.8, 1, 1.3, 1.7];
  const cz =
    typeof subtitleSize === "number" && czValues.includes(subtitleSize)
      ? subtitleSize
      : (czValues[subtitleSize] ?? 1);

  const accentRgb = hexToRgbTriplet(accent) || hexToRgbTriplet(DEFAULT_V4_ACCENT);

  return {
    accent,
    accentRgb,
    setAccent,
    iconSize,
    setIconSize,
    subColor,
    setSubColor,
    subBgStyle,
    setSubBgStyle,
    cz,
  };
}
