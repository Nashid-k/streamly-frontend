import { useEffect, useRef } from "react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Authentic seasonal snowfall — canvas-based particle system with gravity,
   wind sway, and settling on real UI surfaces (cards, buttons, panels).
   Mounted once in Layout so it covers every route. Active Nov 1 -> Dec 31 or
   when the Christmas theme is selected; gated by the `snowfall` preference and
   reduced motion. Transform/opacity only — GPU cheap, pointer-events none. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  const seasonal = month === 10 || month === 11 || theme === "christmas";
  const enabled = seasonal && prefs?.snowfall !== false && !reduceMotion;

  const canvasRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Collect obstacle rects (top surfaces snow can settle on).
    const SELECTORS = [
      ".glass-card", ".settings-section", ".movie-card", ".hero-circle-btn",
      "button", ".nav-link", ".order-item", ".setting-row", ".glassy-button",
      ".bottom-nav-item", "[class*='card']",
    ];
    let obstacles = [];
    let lastCollect = 0;
    const collectObstacles = () => {
      const now = performance.now();
      if (now - lastCollect < 400) return;
      lastCollect = now;
      const rects = [];
      const seen = new Set();
      for (const sel of SELECTORS) {
        let nodes;
        try { nodes = document.querySelectorAll(sel); } catch { continue; }
        nodes.forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width < 24 || r.height < 8) return;
          if (r.top > window.innerHeight || r.bottom < 0) return;
          if (r.left > window.innerWidth || r.right < 0) return;
          const key = Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width);
          if (seen.has(key)) return;
          seen.add(key);
          rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        });
      }
      obstacles = rects;
    };
    collectObstacles();

    // Particles
    const COUNT = 170;
    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: Math.random() * 1.2 + 0.3,
        size: Math.random() * 2.6 + 0.8,
        opacity: Math.random() * 0.5 + 0.35,
        depth: Math.random(), // 0=far,1=near
        stuck: 0, // remaining stuck frames
        stuckVx: 0,
      });
    }

    let windPhase = 0;
    let last = performance.now();

    const step = (t) => {
      if (!running) return;
      const dt = Math.min(32, t - last) / 16.666;
      last = t;
      windPhase += 0.003 * dt;
      const wind = Math.sin(windPhase) * 0.6 + Math.sin(windPhase * 2.3) * 0.25;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const p of particles) {
        if (p.stuck > 0) {
          p.stuck -= dt;
          p.x += p.stuckVx * dt;
          // drift off edges while stuck
          if (p.x < 0 || p.x > window.innerWidth) {
            p.stuck = 0;
            p.vy = 0.5;
          }
          if (p.stuck <= 0) {
            p.vy = 0.4;
            p.vx = (Math.random() - 0.5) * 0.3;
          }
        } else {
          p.vy += 0.06 * dt; // gravity
          p.vx += (wind - p.vx) * 0.02 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // wrap horizontally
          if (p.x < -10) p.x = window.innerWidth + 10;
          if (p.x > window.innerWidth + 10) p.x = -10;
          // recycle at bottom
          if (p.y > window.innerHeight + 10) {
            p.y = -10;
            p.x = Math.random() * window.innerWidth;
            p.vy = Math.random() * 1.2 + 0.3;
            p.vx = (Math.random() - 0.5) * 0.4;
            p.stuck = 0;
          }
          // collision with obstacles (top surface)
          if (p.vy > 0) {
            for (const o of obstacles) {
              if (p.x < o.left || p.x > o.right) continue;
              const bottom = p.y + p.size;
              if (bottom >= o.top && p.y < o.top && bottom - o.top < 6) {
                p.y = o.top - p.size;
                p.vy = 0;
                p.vx *= 0.25;
                p.stuckVx = (Math.random() - 0.5) * 0.15;
                p.stuck = (60 + Math.random() * 120) * dt; // ~1-3s
                break;
              }
            }
          }
        }

        // draw
        const r = p.size * (0.7 + p.depth * 0.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
        g.addColorStop(0, `rgba(255,255,255,${p.opacity})`);
        g.addColorStop(0.5, `rgba(255,255,255,${p.opacity * 0.5})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // throttle obstacle collection
      collectObstacles();

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);

    const onResize = () => resize();
    const onScroll = () => { /* obstacle rects will refresh via throttle */ };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="snowfall-canvas"
      aria-hidden="true"
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
