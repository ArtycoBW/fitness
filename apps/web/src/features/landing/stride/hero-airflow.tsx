"use client";

// 📖 Docs: obsidian/frontend/components/common.md
//
// Airflow streamlines over the hero — thin curved lines that make moving air
// visible. Purely additive: it is a canvas sibling of the trail layer and edits
// nothing about it. A canvas overlay is also the cheap option, because unlike
// an SVG filter it never forces the video layer to re-rasterise.
//
// Each line is a quadratic curve stroked with a gradient that runs 0 → peak → 0
// along its own length, so both ends dissolve without a blur filter. A wider,
// fainter stroke underneath gives the halo. Alpha is enveloped over the line's
// life, so lines are never switched on or off — they arrive and leave.
//
// ---------------------------------------------------------------------------
// COST — each line's gradient is built ONCE, at birth, and then moved.
//
// A CanvasGradient is resolved against the transform in force when it is
// *painted*, not when it is created. So a gradient authored along the line's
// own axis — (0,0) → (length,0) — can be reused for the rest of that line's
// life simply by rotating and translating the context to where the line now is.
// The geometry is identical to placing it in screen coordinates, and the
// stroke width is unaffected because rotation and translation preserve length.
//
// That matters because these are per-frame costs: at 72 lines the old code
// allocated 72 gradients and 72 four-stop colour parses per frame — over 4,000
// a second — to draw lines whose colour ramp never changed. Only the ENVELOPE
// changes, and `globalAlpha` multiplies straight through a gradient, so the
// stops are authored at full alpha and the envelope is applied there instead.
// Same pixels, one allocation per line instead of one per line per frame.

import { useCallback, useEffect, useRef } from "react";

import { useHasHover } from "@/hooks/use-has-hover";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { subscribeToTicker } from "@/lib/animation/ticker";

import { heroAirflowConfig, type Range } from "./hero-airflow.config";

interface Streamline {
  x: number;
  y: number;
  /** Heading at birth; a line keeps it, so the field curves rather than swings. */
  angle: number;
  length: number;
  thickness: number;
  /** Signed lateral bow of the curve. */
  curve: number;
  drift: number;
  alpha: number;
  born: number;
  life: number;
  /**
   * Radial falloff, fixed at birth. Measuring it against the *live* cursor
   * culls the whole field the moment the hand outruns the air: lines drift at
   * 45–140 px/s and a quick drag is ten times that, so every line fell outside
   * the radius and nothing drew at all. Locality is already guaranteed by
   * where a line is seeded.
   */
  falloff: number;
  /**
   * The line's colour ramp, in its own coordinates, at full alpha. Built once
   * — see the COST note above.
   */
  ramp: CanvasGradient;
}

/** The frame time the smoothing constants are calibrated against. */
const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * Minimum gap between frames, ms — see the matching note in hero-trail.tsx for
 * why this is 1000/70 rather than 1000/60. These are soft, near-transparent
 * glows over 30fps footage; drawing them 120 times a second on a high-refresh
 * display bought nothing and competed with the filter next door for the same
 * frame budget.
 */
const MIN_FRAME_MS = 1000 / 70;

/** Exponential smoothing as a time constant, so it is frame-rate independent. */
const smoothing = (tauMs: number, dt: number) =>
  1 - Math.exp(-Math.min(50, Math.max(1, dt)) / Math.max(1, tauMs));

const pick = ([min, max]: Range) => min + Math.random() * (max - min);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hexToRgb = (hex: string) => {
  const v = hex.replace("#", "");
  const f =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  return {
    r: parseInt(f.slice(0, 2), 16),
    g: parseInt(f.slice(2, 4), 16),
    b: parseInt(f.slice(4, 6), 16),
  };
};

// The stroke colour is a constant in the config; it was being re-parsed on
// every frame.
const { r: LINE_R, g: LINE_G, b: LINE_B } = hexToRgb(heroAirflowConfig.color);
const LINE_RGB = `${LINE_R},${LINE_G},${LINE_B}`;
const RAMP_CLEAR = `rgba(${LINE_RGB},0)`;
const RAMP_PEAK = `rgba(${LINE_RGB},1)`;

export const HeroAirflow = () => {
  // Cursor-driven decoration: on a touch device it has nothing to follow, and
  // under reduced motion it should not run at all. Render gates rather than
  // effect guards, so neither case pays for a viewport-sized canvas sitting in
  // the tree under a `mix-blend-mode` — which is composited whether or not
  // anything is ever drawn into it.
  const hasHover = useHasHover();
  const reducedMotion = usePrefersReducedMotion();
  const enabled = hasHover && !reducedMotion;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  const size = useRef({ w: 0, h: 0 });
  const pointer = useRef({ x: 0, y: 0, inside: false });
  const centre = useRef({ x: 0, y: 0 });
  const previous = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  // Fixed flow direction — never written to after this.
  const heading = useRef((heroAirflowConfig.angleDeg * Math.PI) / 180);
  const intensity = useRef(0);
  const lines = useRef<Streamline[]>([]);
  const spawnDebt = useRef(0);
  const lastFrame = useRef(0);
  const unsubscribe = useRef<(() => void) | null>(null);
  // Cached hover-surface origin — see the same note in hero-trail.tsx. Both
  // layers listen to the same `pointermove`, so reading the rect there cost two
  // forced layouts per event.
  const origin = useRef({ x: 0, y: 0 });

  const resize = useCallback(() => {
    const node = rootRef.current;
    const canvas = canvasRef.current;
    if (!node || !canvas) return;
    const rect = node.getBoundingClientRect();
    size.current = { w: rect.width, h: rect.height };
    const scale = heroAirflowConfig.renderScale;
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    // Resizing the backing store resets the context state, and any gradient
    // already built belongs to it. Start the field over rather than stroke with
    // stale objects.
    contextRef.current = canvas.getContext("2d");
    lines.current.length = 0;
  }, []);

  const render = useCallback((time: number) => {
    const c = heroAirflowConfig;
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;

    const dt = lastFrame.current
      ? time - lastFrame.current
      : REFERENCE_FRAME_MS;
    lastFrame.current = time;
    const now = performance.now();
    const seconds = Math.min(0.05, dt / 1000);
    const scale = c.renderScale;

    // --- follow the cursor, late on purpose --------------------------------
    if (pointer.current.inside) {
      const lag = smoothing(c.lagMs, dt);
      centre.current.x += (pointer.current.x - centre.current.x) * lag;
      centre.current.y += (pointer.current.y - centre.current.y) * lag;
    }
    const perFrame = REFERENCE_FRAME_MS / Math.min(50, Math.max(1, dt));
    const vx = (centre.current.x - previous.current.x) * perFrame;
    const vy = (centre.current.y - previous.current.y) * perFrame;
    const vLerp = smoothing(90, dt);
    velocity.current.x += (vx - velocity.current.x) * vLerp;
    velocity.current.y += (vy - velocity.current.y) * vLerp;
    previous.current.x = centre.current.x;
    previous.current.y = centre.current.y;

    // Speed still sets how many lines are born and how long they run, but the
    // flow direction is fixed: air streaming along one diagonal reads as speed,
    // whereas a field that swings with the hand reads as a cursor toy.
    const speed = Math.hypot(velocity.current.x, velocity.current.y);
    const speedNorm = Math.min(1, speed / Math.max(1, c.speedReference));

    intensity.current +=
      ((pointer.current.inside ? 1 : 0) - intensity.current) *
      smoothing(pointer.current.inside ? c.riseMs : c.fallMs, dt);

    // --- spawn --------------------------------------------------------------
    // Fractional debt rather than a per-frame chance: the birth rate then does
    // not change with refresh rate, and no frame can produce a visible burst.
    if (pointer.current.inside) {
      spawnDebt.current +=
        c.spawnPerSecond * (0.25 + 0.75 * speedNorm) * seconds;
      while (spawnDebt.current >= 1 && lines.current.length < c.maxLines) {
        spawnDebt.current -= 1;
        // Bias the seed point behind the cursor, so air appears to stream past
        // it rather than radiate from it.
        const spread = c.radius * 0.72;
        const back = heading.current + Math.PI;
        const along = Math.random() * spread * 0.55;
        const across = (Math.random() - 0.5) * spread;
        const jitter =
          ((Math.random() - 0.5) * 2 * c.angleJitterDeg * Math.PI) / 180;
        const seedX =
          centre.current.x +
          Math.cos(back) * along +
          Math.cos(back + Math.PI / 2) * across;
        const seedY =
          centre.current.y +
          Math.sin(back) * along +
          Math.sin(back + Math.PI / 2) * across;
        const seedDistance = Math.min(
          1,
          Math.hypot(seedX - centre.current.x, seedY - centre.current.y) /
            c.radius,
        );
        const length =
          lerp(c.lengthPx[0], c.lengthPx[1], speedNorm) *
          (0.6 + 0.4 * Math.random());

        // Authored along the line's own axis and at full alpha, so it survives
        // every later frame unchanged — the envelope rides on `globalAlpha`.
        const ramp = ctx.createLinearGradient(0, 0, length, 0);
        ramp.addColorStop(0, RAMP_CLEAR);
        ramp.addColorStop(0.35, RAMP_PEAK);
        ramp.addColorStop(0.6, RAMP_PEAK);
        ramp.addColorStop(1, RAMP_CLEAR);

        lines.current.push({
          x: seedX,
          y: seedY,
          angle: heading.current + jitter,
          length,
          thickness: pick(c.thicknessPx),
          curve: pick(c.curvePx) * (Math.random() < 0.5 ? -1 : 1),
          drift: pick(c.driftPxPerSecond),
          alpha: pick(c.alpha),
          born: now,
          life: pick(c.lifeMs),
          falloff: Math.pow(1 - seedDistance, 1.7),
          ramp,
        });
      }
    } else {
      spawnDebt.current = 0;
    }

    // --- age ----------------------------------------------------------------
    // Compacted in place. `filter` handed back a fresh array every frame, which
    // on a 60Hz loop is 60 throwaway arrays a second for the GC to collect.
    const list = lines.current;
    let kept = 0;
    for (let i = 0; i < list.length; i += 1) {
      const line = list[i]!;
      if (now - line.born >= line.life) continue;
      line.x += Math.cos(line.angle) * line.drift * seconds;
      line.y += Math.sin(line.angle) * line.drift * seconds;
      list[kept] = line;
      kept += 1;
    }
    list.length = kept;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!list.length && intensity.current < 0.004) {
      if (!pointer.current.inside) {
        unsubscribe.current?.();
        unsubscribe.current = null;
      }
      return;
    }

    // --- draw ---------------------------------------------------------------
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    for (let i = 0; i < list.length; i += 1) {
      const line = list[i]!;
      const age = (now - line.born) / line.life;
      // Arrive over the first fifth, leave over the last half — a line is never
      // switched on or off.
      const envelope =
        age < 0.2
          ? age / 0.2
          : age > 0.5
            ? Math.max(0, 1 - (age - 0.5) / 0.5)
            : 1;

      const alpha = line.alpha * envelope * line.falloff * intensity.current;
      if (alpha <= 0.002) continue;

      // Move the context to the line instead of the line to the context: the
      // curve, and the gradient painted along it, are both authored from
      // (0,0) to (length,0). Rotation and translation preserve length, so the
      // stroke widths below still mean what they did in screen pixels.
      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);
      ctx.setTransform(
        scale * cos,
        scale * sin,
        -scale * sin,
        scale * cos,
        scale * line.x,
        scale * line.y,
      );

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(line.length / 2, line.curve, line.length, 0);

      ctx.strokeStyle = line.ramp;

      // Halo first, then the line itself — two strokes read as a soft glow and
      // cost far less than a blur.
      ctx.globalAlpha = c.glowAlpha * alpha;
      ctx.lineWidth = line.thickness * c.glowWidth;
      ctx.stroke();

      ctx.globalAlpha = c.coreAlpha * alpha;
      ctx.lineWidth = line.thickness;
      ctx.stroke();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const ensureRunning = useCallback(() => {
    if (unsubscribe.current) return;
    lastFrame.current = 0;
    unsubscribe.current = subscribeToTicker(render, () => MIN_FRAME_MS);
  }, [render]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !enabled) return;

    const section = node.closest("section");
    const track = () => {
      resize();
      const host = section ?? node;
      const rect = host.getBoundingClientRect();
      origin.current = { x: rect.left, y: rect.top };
    };

    track();
    const observer = new ResizeObserver(track);
    observer.observe(node);
    window.addEventListener("scroll", track, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", track);
    };
  }, [enabled, resize]);

  useEffect(() => {
    if (!enabled) return;

    const section = rootRef.current?.closest("section");
    if (!section) return;

    const onMove = (event: PointerEvent) => {
      pointer.current.x = event.clientX - origin.current.x;
      pointer.current.y = event.clientY - origin.current.y;
      if (!pointer.current.inside) {
        pointer.current.inside = true;
        centre.current = { x: pointer.current.x, y: pointer.current.y };
        previous.current = { ...centre.current };
        velocity.current = { x: 0, y: 0 };
      }
      ensureRunning();
    };
    const onLeave = () => {
      pointer.current.inside = false;
    };
    const stop = () => {
      pointer.current.inside = false;
      unsubscribe.current?.();
      unsubscribe.current = null;
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    const viewport = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) stop();
    });
    viewport.observe(section);
    document.addEventListener("visibilitychange", visibility);

    section.addEventListener("pointermove", onMove);
    section.addEventListener("pointerleave", onLeave);
    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      viewport.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe.current?.();
      unsubscribe.current = null;
    };
  }, [enabled, ensureRunning]);

  if (!enabled) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full mix-blend-screen"
      />
    </div>
  );
};
