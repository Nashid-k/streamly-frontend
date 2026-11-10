import { useMemo } from "react";
import SnowfallLib from "react-snowfall";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal snowfall — powered by the `react-snowfall` package (56k weekly
   downloads, MIT, canvas-based, GPU-cheap). Real star-shaped snowflakes are
   supplied as canvas images so we get genuine 6-pointed stars instead of
   hand-drawn circles. Mounted once in Layout so it covers every route.
   Active Nov 1 -> Dec 31 or when the Christmas theme is selected; gated by
   the `snowfall` preference and reduced motion. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  const seasonal = month === 10 || month === 11 || theme === "christmas";
  const enabled = seasonal && prefs?.snowfall !== false && !reduceMotion;

  // jsdom / very old engines expose no 2D context — render nothing instead of
  // crashing (react-snowfall assumes getContext('2d') is non-null).
  const canvasSupported =
    typeof document !== "undefined" &&
    !!document.createElement("canvas").getContext?.("2d");
  // CanvasImageSource (HTMLCanvasElement) and stretches to 1:1, so square canvases.
  const images = useMemo(() => {
    if (!enabled) return [];
    // jsdom / old engines: no 2D context — skip shape creation.
    if (!document.createElement("canvas").getContext?.("2d")) return [];
    const make = (draw) => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const cx = c.getContext("2d");
      cx.translate(32, 32);
      draw(cx);
      return c;
    };

    // 6-pointed star with side branches
    const star = make((cx) => {
      cx.strokeStyle = "rgba(255,255,255,0.95)";
      cx.lineWidth = 2;
      cx.lineCap = "round";
      cx.shadowColor = "rgba(255,255,255,0.6)";
      cx.shadowBlur = 4;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        cx.beginPath();
        cx.moveTo(0, 0);
        cx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
        cx.stroke();
        const bx = Math.cos(a) * 14;
        const by = Math.sin(a) * 14;
        for (const sign of [-1, 1]) {
          const ba = a + sign * (Math.PI / 3);
          cx.beginPath();
          cx.moveTo(bx, by);
          cx.lineTo(bx + Math.cos(ba) * 7, by + Math.sin(ba) * 7);
          cx.stroke();
        }
      }
      cx.fillStyle = "rgba(255,255,255,0.9)";
      cx.beginPath();
      cx.arc(0, 0, 2.5, 0, Math.PI * 2);
      cx.fill();
    });

    // Hexagonal plate
    const hex = make((cx) => {
      cx.fillStyle = "rgba(255,255,255,0.9)";
      cx.shadowColor = "rgba(200,230,255,0.5)";
      cx.shadowBlur = 6;
      cx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const x = Math.cos(a) * 22;
        const y = Math.sin(a) * 22;
        if (i === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.closePath();
      cx.fill();
      cx.fillStyle = "rgba(200,230,255,0.35)";
      cx.beginPath();
      cx.arc(0, 0, 7, 0, Math.PI * 2);
      cx.fill();
    });

    // Soft circle (simple flake)
    const circle = make((cx) => {
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, 24);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.5, "rgba(230,245,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = g;
      cx.beginPath();
      cx.arc(0, 0, 24, 0, Math.PI * 2);
      cx.fill();
    });

    // Weight stars more heavily for variety
    return [star, star, hex, circle, circle];
  }, [enabled]);

  if (!enabled || !canvasSupported) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <SnowfallLib
      images={images}
      snowflakeCount={isMobile ? 80 : 180}
      radius={[1.5, 4.5]}
      speed={[0.5, 2.5]}
      wind={[-0.8, 1.2]}
      opacity={[0.3, 0.85]}
      rotationSpeed={[-1, 1]}
      enable3DRotation
      changeFrequency={180}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "var(--z-overlay)",
      }}
    />
  );
}
