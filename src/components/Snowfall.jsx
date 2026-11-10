import { useEffect, useRef } from "react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Authentic seasonal snowfall — canvas particle system with real snowflake
   shapes (6-pointed stars, hexagons, circles), depth layers, rotation, wind
   turbulence, gravity, bounce + settle on real UI surfaces, and melt. Mounted
   once in Layout so it covers every route. Active Nov 1 -> Dec 31 or when the
   Christmas theme is selected; gated by the `snowfall` preference and reduced
   motion. Transform/opacity only — GPU cheap, pointer-events none. */
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

    const isMobile = window.innerWidth < 768;
    const BASE_COUNT = isMobile ? 90 : 200;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // ── Pre-render snowflake shapes to offscreen canvases (fast drawImage) ──
    const SHAPE_SIZE = 64;
    function makeShapeCanvas(drawFn) {
      const c = document.createElement("canvas");
      c.width = SHAPE_SIZE;
      c.height = SHAPE_SIZE;
      const cx = c.getContext("2d");
      cx.translate(SHAPE_SIZE / 2, SHAPE_SIZE / 2);
      drawFn(cx, SHAPE_SIZE / 2 - 2);
      return c;
    }

    // 6-pointed snowflake star
    const starCanvas = makeShapeCanvas((cx, r) => {
      cx.strokeStyle = "rgba(255,255,255,0.95)";
      cx.lineWidth = 1.6;
      cx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        cx.beginPath();
        cx.moveTo(0, 0);
        cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        cx.stroke();
        // side branches
        const bx = Math.cos(a) * r * 0.55;
        const by = Math.sin(a) * r * 0.55;
        const ba = a + Math.PI / 3;
        cx.beginPath();
        cx.moveTo(bx, by);
        cx.lineTo(bx + Math.cos(ba) * r * 0.25, by + Math.sin(ba) * r * 0.25);
        cx.stroke();
        const ba2 = a - Math.PI / 3;
        cx.beginPath();
        cx.moveTo(bx, by);
        cx.lineTo(bx + Math.cos(ba2) * r * 0.25, by + Math.sin(ba2) * r * 0.25);
        cx.stroke();
      }
      // center dot
      cx.fillStyle = "rgba(255,255,255,0.9)";
      cx.beginPath();
      cx.arc(0, 0, 2, 0, Math.PI * 2);
      cx.fill();
    });

    // Hexagon
    const hexCanvas = makeShapeCanvas((cx, r) => {
      cx.fillStyle = "rgba(255,255,255,0.9)";
      cx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.closePath();
      cx.fill();
      // inner highlight
      cx.fillStyle = "rgba(200,230,255,0.4)";
      cx.beginPath();
      cx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      cx.fill();
    });

    // Soft circle (simple flake)
    const circleCanvas = makeShapeCanvas((cx, r) => {
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.6, "rgba(230,245,255,0.6)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = g;
      cx.beginPath();
      cx.arc(0, 0, r, 0, Math.PI * 2);
      cx.fill();
    });

    const shapes = [starCanvas, hexCanvas, circleCanvas, circleCanvas]; // weight circles more

    // ── Obstacle collection (top surfaces snow can settle on) ──
    const SELECTORS = [
      ".glass-card", ".settings-section", ".movie-card", ".hero-circle-btn",
      "button", ".nav-link", ".order-item", ".setting-row", ".glassy-button",
      ".bottom-nav-item", "[class*='card']", ".hero-meta-item",
    ];
    let obstacles = [];
    let lastCollect = 0;
    const collectObstacles = () => {
      const now = performance.now();
      if (now - lastCollect < 500) return;
      lastCollect = now;
      const rects = [];
      const seen = new Set();
      for (const sel of SELECTORS) {
        let nodes;
        try { nodes = document.querySelectorAll(sel); } catch { continue; }
        nodes.forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width < 20 || r.height < 6) return;
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

    // ── Particles ──
    const particles = [];
    for (let i = 0; i < BASE_COUNT; i++) {
      const depth = Math.random(); // 0=far, 1=near
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: Math.random() * 0.8 + 0.2,
        size: 0.6 + depth * 1.8, // near = bigger
        opacity: 0.25 + depth * 0.55,
        depth,
        rotation: Math.random() * Math.PI * 2,
        angularVel: (Math.random() - 0.5) * 0.04,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        stuck: 0,
        stuckVx: 0,
        melt: 0, // 0 = not melting, >0 = melting progress
      });
    }

    let windPhase = 0;
    let last = performance.now();
    let mouseX = -9999;
    let mouseY = -9999;
    const onMouse = (e) => { mouseX = e.clientX; mouseY = e.clientY; };
    window.addEventListener("mousemove", onMouse, { passive: true });

    const step = (t) => {
      if (!running) return;
      const dt = Math.min(32, t - last) / 16.666;
      last = t;
      windPhase += 0.0025 * dt;
      // Layered wind: slow drift + gusts
      const wind = Math.sin(windPhase) * 0.5 + Math.sin(windPhase * 2.1) * 0.2 + Math.sin(windPhase * 0.37) * 0.15;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const p of particles) {
        if (p.melt > 0) {
          p.melt += 0.02 * dt;
          p.size *= 0.97;
          p.opacity *= 0.96;
          p.y += 0.3 * dt;
          if (p.melt > 1 || p.opacity < 0.05) {
            // recycle
            p.x = Math.random() * window.innerWidth;
            p.y = -10;
            p.vy = Math.random() * 0.8 + 0.2;
            p.vx = (Math.random() - 0.5) * 0.3;
            p.size = 0.6 + p.depth * 1.8;
            p.opacity = 0.25 + p.depth * 0.55;
            p.melt = 0;
            p.stuck = 0;
            p.rotation = Math.random() * Math.PI * 2;
          }
        } else if (p.stuck > 0) {
          p.stuck -= dt;
          p.x += p.stuckVx * dt;
          p.rotation += p.angularVel * 0.3 * dt;
          if (p.x < 0 || p.x > window.innerWidth) {
            p.stuck = 0;
            p.vy = 0.5;
          }
          if (p.stuck <= 0) {
            p.vy = 0.3;
            p.vx = (Math.random() - 0.5) * 0.3;
          }
        } else {
          // mouse interaction: gentle push
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80 && dist > 0) {
            const force = (80 - dist) / 80 * 0.03;
            p.vx += (dx / dist) * force * dt;
            p.vy += (dy / dist) * force * dt;
          }

          p.vy += 0.05 * dt * (0.7 + p.depth * 0.6); // gravity scaled by depth
          p.vx += (wind * (0.5 + p.depth * 0.5) - p.vx) * 0.03 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rotation += p.angularVel * dt;

          // wrap horizontally
          if (p.x < -20) p.x = window.innerWidth + 20;
          if (p.x > window.innerWidth + 20) p.x = -20;

          // recycle at bottom → melt
          if (p.y > window.innerHeight + 10) {
            p.melt = 0.01; // start melting
            p.y = window.innerHeight;
            continue;
          }

          // collision with obstacles (top surface) — bounce then settle
          if (p.vy > 0) {
            for (const o of obstacles) {
              if (p.x < o.left - 4 || p.x > o.right + 4) continue;
              const bottom = p.y + p.size * 2;
              if (bottom >= o.top && p.y < o.top && bottom - o.top < 8) {
                // bounce
                if (p.vy > 0.8) {
                  p.vy = -p.vy * 0.35;
                  p.vx *= 0.6;
                  p.y = o.top - p.size * 2 - 1;
                } else {
                  // settle
                  p.y = o.top - p.size * 2;
                  p.vy = 0;
                  p.vx *= 0.2;
                  p.stuckVx = (Math.random() - 0.5) * 0.1;
                  p.stuck = (80 + Math.random() * 160);
                }
                break;
              }
            }
          }
        }

        // draw with depth blur
        const drawSize = p.size * (p.depth > 0.6 ? 1.2 : 1) * (p.melt > 0 ? p.size : 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity * (p.depth > 0.7 ? 1 : 0.85);
        if (p.depth < 0.3) {
          ctx.filter = "blur(0.8px)";
        }
        const src = p.depth > 0.65 ? shapes[0] : p.depth > 0.35 ? shapes[1] : shapes[2];
        const drawW = drawSize * 4;
        ctx.drawImage(src, -drawW / 2, -drawW / 2, drawW, drawW);
        ctx.restore();
      }

      collectObstacles();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);

    const onResize = () => resize();
    const onScroll = () => { /* obstacle rects refresh via throttle */ };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
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
