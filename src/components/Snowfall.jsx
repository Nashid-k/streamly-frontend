import { useEffect, useRef } from "react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Authentic seasonal snowfall — canvas particle system with hand-drawn flake
   styles (classic stellar, dendrite, plate, soft bokeh), real physics (gravity,
   wind turbulence, drag, bounce, settle, melt, slide), surface accumulation,
   cursor wipe-to-clean interaction, and cute animations (twinkle, sparkle, glow).
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
    const isMobile = window.innerWidth < 768;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // ── Pre-render flake sprites (drawn once, stamped each frame) ──
    const SPRITE = 80;
    function makeSprite(drawFn, glow = false) {
      const c = document.createElement("canvas");
      c.width = SPRITE;
      c.height = SPRITE;
      const cx = c.getContext("2d");
      cx.translate(SPRITE / 2, SPRITE / 2);
      if (glow) {
        cx.shadowColor = "rgba(200,230,255,0.6)";
        cx.shadowBlur = 8;
      }
      drawFn(cx, SPRITE / 2 - 4);
      return c;
    }

    // Classic stellar (6-pointed)
    const classicSprite = makeSprite((cx, r) => {
      cx.strokeStyle = "rgba(255,255,255,0.95)";
      cx.lineWidth = 1.8;
      cx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        cx.beginPath();
        cx.moveTo(0, 0);
        cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        cx.stroke();
        const bx = Math.cos(a) * r * 0.5;
        const by = Math.sin(a) * r * 0.5;
        for (const sign of [-1, 1]) {
          const ba = a + sign * (Math.PI / 3);
          cx.beginPath();
          cx.moveTo(bx, by);
          cx.lineTo(bx + Math.cos(ba) * r * 0.22, by + Math.sin(ba) * r * 0.22);
          cx.stroke();
        }
      }
      cx.fillStyle = "rgba(255,255,255,0.9)";
      cx.beginPath();
      cx.arc(0, 0, 2, 0, Math.PI * 2);
      cx.fill();
    }, true);

    // Dendrite (feathery branching)
    const dendriteSprite = makeSprite((cx, r) => {
      cx.strokeStyle = "rgba(240,248,255,0.9)";
      cx.lineWidth = 1.2;
      cx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        cx.beginPath();
        cx.moveTo(0, 0);
        cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        cx.stroke();
        // feathery sub-branches along the arm
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          const bx = Math.cos(a) * r * t;
          const by = Math.sin(a) * r * t;
          for (const sign of [-1, 1]) {
            const ba = a + sign * 0.6;
            cx.beginPath();
            cx.moveTo(bx, by);
            cx.lineTo(bx + Math.cos(ba) * r * 0.18, by + Math.sin(ba) * r * 0.18);
            cx.stroke();
          }
        }
      }
    }, true);

    // Plate (hexagonal crystal)
    const plateSprite = makeSprite((cx, r) => {
      cx.fillStyle = "rgba(255,255,255,0.85)";
      cx.shadowColor = "rgba(180,220,255,0.5)";
      cx.shadowBlur = 6;
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
      // inner hexagon
      cx.fillStyle = "rgba(220,240,255,0.3)";
      cx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const x = Math.cos(a) * r * 0.5;
        const y = Math.sin(a) * r * 0.5;
        if (i === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.closePath();
      cx.fill();
    }, true);

    // Soft bokeh (blurred circle with glow)
    const bokehSprite = makeSprite((cx, r) => {
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.4, "rgba(230,245,255,0.6)");
      g.addColorStop(0.7, "rgba(200,230,255,0.25)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = g;
      cx.beginPath();
      cx.arc(0, 0, r, 0, Math.PI * 2);
      cx.fill();
    }, true);

    // Sparkle sprite (occasional bright twinkle)
    const sparkleSprite = makeSprite((cx, r) => {
      cx.strokeStyle = "rgba(255,255,255,0.9)";
      cx.lineWidth = 1;
      cx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        cx.beginPath();
        cx.moveTo(0, 0);
        cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        cx.stroke();
      }
      cx.fillStyle = "rgba(255,255,255,0.95)";
      cx.beginPath();
      cx.arc(0, 0, 1.5, 0, Math.PI * 2);
      cx.fill();
    }, true);

    const sprites = [classicSprite, dendriteSprite, plateSprite, bokehSprite, classicSprite, dendriteSprite];

    // ── Obstacle collection ──
    const SELECTORS = [
      ".glass-card", ".settings-section", ".movie-card", ".hero-circle-btn",
      "button", ".nav-link", ".order-item", ".setting-row", ".glassy-button",
      ".bottom-nav-item", "[class*='card']", ".hero-meta-item",
      ".ambient-liquid__blob",
    ];
    let obstacles = [];
    let lastCollect = 0;
    const collectObstacles = () => {
      const now = performance.now();
      if (now - lastCollect < 300) return;
      lastCollect = now;
      const rects = [];
      const seen = new Set();
      for (const sel of SELECTORS) {
        let nodes;
        try { nodes = document.querySelectorAll(sel); } catch { continue; }
        nodes.forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width < 16 || r.height < 6) return;
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

    // ── Surface accumulation (snow caps on top of elements) ──
    // Track pile height per obstacle (index into obstacles array). Rendered as
    // a thin snow layer on top of each surface.
    const piles = new Map();

    // ── Particles ──
    const COUNT = isMobile ? 120 : 260;
    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      const depth = Math.random();
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: Math.random() * 1.0 + 0.3,
        size: 0.5 + depth * 2.2,
        opacity: 0.2 + depth * 0.6,
        depth,
        rotation: Math.random() * Math.PI * 2,
        angularVel: (Math.random() - 0.5) * 0.06,
        sprite: sprites[Math.floor(Math.random() * sprites.length)],
        stuck: 0,
        stuckVx: 0,
        melt: 0,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        sparkleTimer: Math.random() * 200,
      });
    }

    // ── Cursor wipe state ──
    let mouseX = -9999;
    let mouseY = -9999;
    let mouseVx = 0;
    let mouseVy = 0;
    let lastMouseX = -9999;
    let lastMouseY = -9999;
    let wipeStrength = 0; // decays over time
    const onMouseMove = (e) => {
      if (lastMouseX > -9000) {
        mouseVx = e.clientX - lastMouseX;
        mouseVy = e.clientY - lastMouseY;
        const speed = Math.sqrt(mouseVx * mouseVx + mouseVy * mouseVy);
        if (speed > 8) {
          wipeStrength = Math.min(1, wipeStrength + speed / 60);
        }
      }
      mouseX = e.clientX;
      mouseY = e.clientY;
      lastMouseX = mouseX;
      lastMouseY = mouseY;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    let windPhase = 0;
    let last = performance.now();

    const step = (t) => {
      if (!running) return;
      const dt = Math.min(32, t - last) / 16.666;
      last = t;
      windPhase += 0.002 * dt;
      // Layered wind: slow drift + gusts + cursor influence
      const wind = Math.sin(windPhase) * 0.4
        + Math.sin(windPhase * 2.1) * 0.15
        + Math.sin(windPhase * 0.37) * 0.1;
      wipeStrength *= 0.92; // decay

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // ── Cursor wipe visual (subtle frost trail) ──
      if (wipeStrength > 0.05) {
        ctx.save();
        ctx.globalAlpha = wipeStrength * 0.15;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        const wipeRadius = 60 + wipeStrength * 40;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, wipeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const p of particles) {
        // Twinkle
        p.twinkle += p.twinkleSpeed * dt;
        const twinkleBoost = (Math.sin(p.twinkle) + 1) * 0.5;

        if (p.melt > 0) {
          p.melt += 0.015 * dt;
          p.size *= 0.97;
          p.opacity *= 0.96;
          p.y += 0.4 * dt;
          p.rotation += p.angularVel * dt;
          if (p.melt > 1 || p.opacity < 0.05) {
            // recycle
            p.x = Math.random() * window.innerWidth;
            p.y = -10 - Math.random() * 40;
            p.vy = Math.random() * 1.0 + 0.3;
            p.vx = (Math.random() - 0.5) * 0.5;
            p.size = 0.5 + p.depth * 2.2;
            p.opacity = 0.2 + p.depth * 0.6;
            p.melt = 0;
            p.stuck = 0;
            p.rotation = Math.random() * Math.PI * 2;
            p.twinkle = Math.random() * Math.PI * 2;
          }
        } else if (p.stuck > 0) {
          p.stuck -= dt;
          // Cursor wipe clears stuck snow
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (wipeStrength > 0.1 && dist < 80) {
            p.stuck = 0;
            p.vy = 0.5;
            p.vx = (dx / (dist + 1)) * wipeStrength * 2;
            p.melt = 0.01;
          }
          p.x += p.stuckVx * dt;
          p.rotation += p.angularVel * 0.2 * dt;
          if (p.x < 0 || p.x > window.innerWidth) {
            p.stuck = 0;
            p.vy = 0.5;
          }
          if (p.stuck <= 0) {
            p.vy = 0.3;
            p.vx = (Math.random() - 0.5) * 0.3;
          }
        } else {
          // Mouse interaction: gentle push + cursor wipe
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100 && dist > 0) {
            const force = (100 - dist) / 100 * 0.04 * (1 + wipeStrength * 3);
            p.vx += (dx / dist) * force * dt;
            p.vy += (dy / dist) * force * dt * 0.5;
          }

          p.vy += 0.05 * dt * (0.7 + p.depth * 0.6);
          p.vx += (wind * (0.5 + p.depth * 0.5) - p.vx) * 0.03 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rotation += p.angularVel * dt;

          // wrap horizontally
          if (p.x < -20) p.x = window.innerWidth + 20;
          if (p.x > window.innerWidth + 20) p.x = -20;

          // recycle at bottom -> melt
          if (p.y > window.innerHeight + 10) {
            p.melt = 0.01;
            p.y = window.innerHeight;
            continue;
          }

          // collision with obstacles
          if (p.vy > 0) {
            for (const o of obstacles) {
              if (p.x < o.left - 4 || p.x > o.right + 4) continue;
              const bottom = p.y + p.size * 2;
              if (bottom >= o.top && p.y < o.top && bottom - o.top < 8) {
                if (p.vy > 1.0) {
                  p.vy = -p.vy * 0.3;
                  p.vx *= 0.5;
                  p.y = o.top - p.size * 2 - 1;
                } else {
                  p.y = o.top - p.size * 2;
                  p.vy = 0;
                  p.vx *= 0.15;
                  p.stuckVx = (Math.random() - 0.5) * 0.08;
                  p.stuck = (100 + Math.random() * 200);
                }
                break;
              }
            }
          }
        }

        // ── Draw ──
        const twinkleAlpha = 0.7 + twinkleBoost * 0.3;
        const alpha = p.opacity * twinkleAlpha * (p.depth > 0.7 ? 1 : 0.85);
        const drawSize = p.size * (p.depth > 0.6 ? 1.3 : 1) * (p.melt > 0 ? Math.max(0.1, 1 - p.melt) : 1);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, alpha);
        if (p.depth < 0.3) {
          ctx.filter = "blur(0.6px)";
        }
        const src = p.sprite;
        const drawW = drawSize * 4;
        ctx.drawImage(src, -drawW / 2, -drawW / 2, drawW, drawW);

        // Occasional sparkle
        if (p.sparkleTimer <= 0 && p.depth > 0.5) {
          ctx.globalAlpha = 0.9;
          ctx.filter = "none";
          const sw = drawSize * 2.5;
          ctx.drawImage(sparkleSprite, -sw / 2, -sw / 2, sw, sw);
          p.sparkleTimer = 150 + Math.random() * 300;
        } else {
          p.sparkleTimer -= dt;
        }

        ctx.restore();
      }

      // ── Surface accumulation (snow caps on top of elements) ──
      // Render a thin snow layer on top of each obstacle that has settled flakes.
      // We approximate: count stuck flakes per obstacle top-band and draw a cap.
      const capCounts = new Map();
      for (const p of particles) {
        if (p.stuck > 0) {
          for (const o of obstacles) {
            if (p.x >= o.left && p.x <= o.right && Math.abs(p.y + p.size * 2 - o.top) < 4) {
              capCounts.set(o, (capCounts.get(o) || 0) + 1);
              break;
            }
          }
        }
      }
      for (const [o, count] of capCounts) {
        if (count < 2) continue;
        const capH = Math.min(8, 2 + count * 0.4);
        ctx.save();
        ctx.globalAlpha = 0.7;
        const grad = ctx.createLinearGradient(0, o.top - capH, 0, o.top);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.6)");
        grad.addColorStop(1, "rgba(255,255,255,0.85)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(o.left, o.top);
        ctx.lineTo(o.right, o.top);
        ctx.lineTo(o.right, o.top - capH);
        // wavy top edge
        for (let x = o.right; x >= o.left; x -= 8) {
          const wave = Math.sin(x * 0.1 + performance.now() * 0.001) * 1.5;
          ctx.lineTo(x, o.top - capH + wave);
        }
        ctx.closePath();
        ctx.fill();
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
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
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
        zIndex: 5000,
      }}
    />
  );
}
