// 📖 Docs: obsidian/frontend/components/common.md
//
// Hero backdrop with a cursor-driven drag trail.
//
// Locality is a CSS `mask-image` built per frame from the position buffer — one
// radial-gradient per sample. It started life as an SVG <mask> of circles,
// which had to go: a <mask> on an ancestor of a group carrying an SVG `filter`
// renders nothing at all in Chromium (isolated down to a solid white rect
// masking a filtered group into blank). Gradients also hand us the zone shape
// and edge falloff for free.
//
// The smear axis is FIXED at `blur.angle`, applied by rotating the filtered
// <g> and counter-rotating the picture inside it about the same pivot, so the
// anisotropic turbulence axis sits on that diagonal while the footage stays
// upright. Turbulence only modulates fibre thickness; it never steers.
//
// The axis used to follow cursor velocity. It no longer does: every focus in
// the tail re-oriented at once, so the whole field was seen to swing round
// whenever the hand turned. Speed still drives how far pixels are dragged.
//
// ---------------------------------------------------------------------------
// COST — read this before adding anything to the filter.
//
// Every attribute written inside `frame()` re-runs the WHOLE filter graph over
// the whole region, on every one of the video's frames as well. So the graph is
// kept to the primitives that earn their place, and anything constant is set
// once, outside the loop:
//
//  · The glow branch (8 primitives, including a second full-region
//    feDisplacementMap) only exists in the DOM when `glowIntensity > 0`. At 0 —
//    where it has sat since the warm flood was rejected — its only consumer is
//    `feBlend mode="soft-light"`, and soft-light against a fully transparent
//    layer returns its backdrop untouched. So the branch was computing a
//    provable no-op every frame.
//  · The rotate/counter-rotate transforms are constant between resizes. They
//    used to be rewritten every frame, which dirtied an ancestor of the
//    filtered subtree and defeated any caching the engine had.
//
// One thing that LOOKS like it should collapse and must not: the three trailing
// colour matrices — saturate 1.3, hueRotate −6, cold 0.25. They are constant,
// they are linear, and their product is a single matrix, so folding them into
// one feColorMatrix is the obvious next move. It changes the picture. Filter
// primitives hand their result on through an 8-bit surface, so a chain CLAMPS
// at every step, and saturate 1.3 pushes colour out of gamut on purpose.
// Measured against this footage, the collapsed matrix diverges from the chain
// by a mean of 1.9/255 but by up to 18/255 — on the athletes' orange kit, which
// is the one thing in frame the eye is actually on. Three cheap primitives is
// the price of that clamp; they stay.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useHasHover } from "@/hooks/use-has-hover";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { subscribeToTicker } from "@/lib/animation/ticker";
import type { HeroMedia, HeroVideo } from "@/types/hero";

import { HERO_TRAIL_MAX_SAMPLES, heroTrailConfig } from "./hero-trail.config";
// Types only — the renderer itself is dynamically imported, so nothing of it
// reaches the bundle on a device that will never run it.
import type { TrailFocus, TrailRenderer } from "./hero-trail-gl";

export interface HeroTrailProps {
  paused?: boolean;
  /** Still frame — poster, and what shows when motion is switched off. */
  image: HeroMedia;
  /** Clip, looped, in its two encodes. */
  video: HeroVideo;
}

interface Sample {
  x: number;
  y: number;
  t: number;
  speed: number;
  /** Heading when this point was recorded, so the tail keeps the shape of the
   *  path instead of every focus swinging to the live heading. */
  dirX: number;
  dirY: number;
}

/**
 * Radial falloff for one focus: `(1 − r²)²`.
 *
 * The requirement is not just that alpha reaches zero at the rim — it is that it
 * reaches zero with ZERO SLOPE. This replaced a six-stop table interpolated
 * linearly, which ran into the rim at a slope of −0.70 and then stopped flat. A
 * first-derivative break reads as a hard edge even when the value is continuous
 * (Mach banding), and it showed as a solid ring around the trail; five fainter
 * ones sat at the interior stops for the same reason.
 *
 * This curve arrives tangentially and tracks the authored stops to within 0.034,
 * so the shape the design asked for survives — only its kinks are gone. The GL
 * renderer evaluates the identical expression per pixel.
 */
const falloff = (r: number) => {
  const k = 1 - r * r;
  return k <= 0 ? 0 : k * k;
};

/**
 * Where the fallback's CSS gradients sample that curve. CSS interpolates
 * linearly between stops, so the positions are clustered toward the rim — that
 * is the only place the straight-line error would be visible as an edge, and
 * ending on a 0.95 → 1 segment puts the final slope within rounding of the
 * smooth curve's own.
 */
const FALLOFF_STOPS: readonly number[] = [
  0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.95, 1,
];

const FILTER_ID = "hero-trail-fx";
/** The frame time every smoothing constant is calibrated against. */
const REFERENCE_FRAME_MS = 1000 / 60;
/**
 * The filtered copy is rasterised at half linear resolution, and every
 * px-valued filter parameter is scaled to match. It is not what makes this
 * fast — see the note in the report — but it does cut GPU fill on weaker
 * hardware.
 */
const FX_SCALE = 0.5;

/**
 * The DRAG colour matrix — turbulence squeezed into a one-signed displacement
 * map. Shared by the live primitive and the baked copy so the two cannot drift.
 */
const DRAG_MATRIX = "0.5 0 0 0 0.5  0 0.12 0 0 0.44  0 0 1 0 0  0 0 0 0 1";

/**
 * Minimum gap between trail frames, ms.
 *
 * Deliberately 1000/70 and not 1000/60: the ticker skips a subscriber when
 * `elapsed <= framerate`, so an exact 16.67 would drop every other frame on a
 * 60Hz display and halve the effect to 30fps. At 1000/70 a 60Hz display runs
 * every frame and a 120/144Hz display runs every other one — which is the point.
 * Nothing here is worth 120 evaluations a second: the footage is 30fps and the
 * effect is a soft smear over it, so the extra passes were paying full price
 * for a difference no one can see.
 */
const TRAIL_MIN_FRAME_MS = 1000 / 70;

/**
 * Renders the turbulence field ONCE, off-line, and hands back a raster.
 *
 * `feTurbulence` is the most expensive primitive in the graph — three octaves of
 * Perlin over the whole filter region, per channel — and every one of its inputs
 * is a constant. It was being regenerated on every pass anyway, because Blink
 * evaluates a filter as a whole: change `scale` on a displacement map and the
 * entire chain re-runs, turbulence included. There is no per-primitive cache to
 * lean on.
 *
 * So the browser is asked to do it once, in a throwaway SVG, and the result is
 * rasterised to a blob that `feImage` feeds back in as a plain image. Using the
 * browser's own `feTurbulence` to bake it is the whole trick: the field is
 * bit-identical to what the live primitive produced, because it IS the live
 * primitive — just evaluated once instead of a hundred times a second.
 *
 * The rect is drawn in the same user-space coordinates the real filter region
 * occupies, so the noise keeps its phase. `feTurbulence` is a function of
 * absolute user space, and baking it at the wrong origin would slide the fibre
 * pattern sideways.
 */
const bakeDragMap = async (
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> => {
  const c = heroTrailConfig;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${width} ${height}">` +
    `<filter id="b" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${c.fibres.anisotropyX} ${c.fibres.anisotropyY}" numOctaves="${c.fibres.octaves}" seed="${c.fibres.seed}" stitchTiles="stitch" result="F"/>` +
    `<feColorMatrix in="F" type="matrix" values="${DRAG_MATRIX}"/>` +
    `</filter>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" filter="url(#b)"/>` +
    `</svg>`;

  try {
    const image = new window.Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, w, h);

    // Confirm something actually landed. Rendering an SVG through `Image` is
    // the fragile step in this chain — a strict `img-src` policy can refuse the
    // data URI and leave a blank canvas, and a blank DRAG map is far worse than
    // no bake at all: R=0 everywhere reads as a full negative displacement, so
    // the smear would break rather than simply not improve. A uniform field is
    // therefore treated as a failure and the live primitive is kept.
    try {
      const probe = ctx.getImageData(
        0,
        0,
        Math.min(w, 64),
        Math.min(h, 64),
      ).data;
      let varied = false;
      for (let i = 4; i < probe.length; i += 4) {
        if (probe[i] !== probe[0] || probe[i + 1] !== probe[1]) {
          varied = true;
          break;
        }
      }
      if (!varied) return null;
    } catch {
      // Tainted or otherwise unreadable — fall through and let `toBlob` decide.
    }

    return canvas;
  } catch {
    // Any failure leaves the field null and the live primitive in place, so the
    // effect degrades to exactly what it was before rather than breaking.
    return null;
  }
};

/**
 * The same field as a blob URL, for the SVG fallback's `feImage`.
 *
 * Only reached when WebGL is unavailable — the GL path uploads the canvas
 * straight to a texture and never needs the encode. A blob rather than
 * `toDataURL`, because the field is incompressible noise and its base64 would
 * be roughly a megabyte of string built on the main thread.
 */
const canvasToObjectUrl = (canvas: HTMLCanvasElement) =>
  new Promise<string | null>((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
        "image/png",
      );
    } catch {
      resolve(null);
    }
  });

/**
 * How long the filtered copy keeps decoding after the trail has faded out.
 *
 * It is a second decoder running a second copy of the footage, and while the
 * trail is down it is behind a fully transparent mask — nobody can see it. The
 * delay is there so a hand that pauses mid-sweep does not pay a resume, and it
 * is comfortably longer than `trail.lifetime`.
 */
const FX_IDLE_PAUSE_MS = 2600;

/**
 * Drift the filtered copy is allowed before it is corrected, and how hard the
 * correction pulls.
 *
 * Correction is a `playbackRate` nudge, NOT a seek. The two elements run on
 * their own decoder clocks and drift a few ms an hour apart; the old code
 * answered that by assigning `currentTime` on every `timeupdate`, and each of
 * those assignments flushes the decode pipeline and re-decodes from the nearest
 * keyframe. On a layer that is also carrying a 10-primitive filter, that read
 * as the video stalling. A 2% rate change closes the same gap invisibly —
 * doubly so here, where the corrected layer is blurred and displaced anyway.
 */
const FX_SYNC = { tolerance: 0.04, hardSeek: 0.6, rate: 0.02 } as const;

/**
 * Converts a per-frame lerp factor into a time-based one. A raw
 * `value += (target - value) * k` converges twice as fast at 120Hz as at 60Hz,
 * so the same numbers feel snappy on one display and sluggish on another.
 */
const timeScaledLerp = (k: number, dt: number) =>
  1 -
  Math.pow(
    1 - Math.min(0.999, k),
    Math.min(50, Math.max(4, dt)) / REFERENCE_FRAME_MS,
  );

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

/**
 * Warm-biased luminance into the alpha channel; RGB are discarded. b = 0 is
 * Rec.709 luminance, b = 1 subtracts blue hard so cool pixels — the sky —
 * score near zero and never reach the glow branch.
 */
const warmLumaMatrix = (b: number) => {
  const wr = 0.2126 + (0.55 - 0.2126) * b;
  const wg = 0.7152 + (0.4 - 0.7152) * b;
  const wb = 0.0722 + (-0.45 - 0.0722) * b;
  return `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${wr.toFixed(4)} ${wg.toFixed(4)} ${wb.toFixed(4)} 0 0`;
};

/**
 * Alpha = "how much is this pixel a runner rather than sky". Warm, dark pixels
 * score high; blue-dominant bright ones score ~0. Without it the smear treats
 * sky and figures alike and the sky turns to grey mush.
 */
const subjectMatrix = (k: number) =>
  `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${(1.2 * k).toFixed(4)} ${(0.2 * k).toFixed(4)} ${(-1.2 * k).toFixed(4)} 0 ${(1 - k + 0.35 * k).toFixed(4)}`;

/** Darkens and deepens blue-dominant pixels; warm ones barely move. k ∈ [0,1]. */
const coldMatrix = (k: number) =>
  `1 0 ${-0.18 * k} 0 0  0 1 ${-0.12 * k} 0 0  0 0 ${1 - 0.4 * k} 0 0  0 0 0 1 0`;

export const HeroTrail = ({ image, video, paused = false }: HeroTrailProps) => {
  // Capability, not width — a touchscreen laptop is wide and coarse.
  //
  // These are render gates, not just effect guards. Without a hovering pointer
  // the effect can never run, and the filtered copy of the footage is a whole
  // second video decoding behind a fully transparent mask — the last thing a
  // phone needs. So the entire filter subtree, video included, is left out of
  // the tree on touch and under reduced motion; what ships there is one
  // `<video>` over the poster.
  const hasHover = useHasHover();
  const reducedPreference = usePrefersReducedMotion();
  const reducedMotion = reducedPreference || paused;
  const effectEnabled = hasHover && !reducedMotion;

  /**
   * The filter region in the filter's own user space, rounded so that ordinary
   * resize noise does not trigger a re-bake. `x/y = -8%`, `w/h = 116%` of the
   * filtered group's bounding box, which is the `foreignObject` at half the
   * root box — kept in step with the `<filter>` attributes below by hand.
   */
  const [region, setRegion] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  /** The baked turbulence field. Feeds the GL texture, or the SVG `feImage`. */
  const [dragField, setDragField] = useState<HTMLCanvasElement | null>(null);
  /** Object URL of that field — only produced on the SVG fallback path. */
  const [bakedDrag, setBakedDrag] = useState<string | null>(null);
  /**
   * True once WebGL has been ruled out. Until then the canvas is the renderer
   * and the SVG subtree — including its second `<video>` — is never mounted.
   */
  const [glUnavailable, setGlUnavailable] = useState(false);
  /** True once the renderer exists — the draw loop keys off this. */
  const [glLive, setGlLive] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const rotateRef = useRef<SVGGElement>(null);
  const filterHostRef = useRef<SVGGElement>(null);
  const counterRotateRef = useRef<SVGGElement>(null);
  const baseVideoRef = useRef<HTMLVideoElement>(null);
  const fxVideoRef = useRef<HTMLVideoElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<TrailRenderer | null>(null);
  /** Scratch, reused every frame — the focus list must not allocate per tick. */
  const focuses = useRef<TrailFocus[]>([]);

  const turbulenceRef = useRef<SVGFETurbulenceElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const smearBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const highlightMaskRef = useRef<SVGFEColorMatrixElement>(null);
  const thresholdRef = useRef<SVGFEFuncAElement>(null);
  const highlightDispRef = useRef<SVGFEDisplacementMapElement>(null);
  const floodRef = useRef<SVGFEFloodElement>(null);
  const glowRef = useRef<SVGFEFuncAElement>(null);
  const blendRef = useRef<SVGFEBlendElement>(null);
  const saturateRef = useRef<SVGFEColorMatrixElement>(null);
  const hueRef = useRef<SVGFEColorMatrixElement>(null);
  const coldRef = useRef<SVGFEColorMatrixElement>(null);
  const subjectRef = useRef<SVGFEColorMatrixElement>(null);

  const pointer = useRef({ x: 0, y: 0, inside: false });
  const smooth = useRef({ x: 0, y: 0 });
  const previous = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  // Fixed smear axis — never written to after this.
  const direction = useRef({
    x: Math.cos((heroTrailConfig.blur.angle * Math.PI) / 180),
    y: Math.sin((heroTrailConfig.blur.angle * Math.PI) / 180),
  });
  const energy = useRef(0);
  const samples = useRef<Sample[]>([]);
  const size = useRef({ w: 0, h: 0 });
  // Where the hover surface sits in the viewport. Cached, because reading it
  // per `pointermove` forces a synchronous layout on an event that fires at the
  // display's refresh rate — and it was being read twice, once here and once in
  // the airflow layer.
  const origin = useRef({ x: 0, y: 0 });
  const attached = useRef(false);
  const lastFrame = useRef(0);
  const unsubscribe = useRef<(() => void) | null>(null);
  // Last values written to the DOM, so a frame that changes nothing writes
  // nothing. A no-op `style.maskImage` assignment still invalidates paint.
  const lastMask = useRef("");
  const lastScale = useRef("");
  const fxPauseTimer = useRef(0);

  /** Everything in the filter that never changes at runtime. Set once. */
  const applyStatic = useCallback(() => {
    const c = heroTrailConfig;
    turbulenceRef.current?.setAttribute(
      "baseFrequency",
      `${c.fibres.anisotropyX} ${c.fibres.anisotropyY}`,
    );
    turbulenceRef.current?.setAttribute("numOctaves", `${c.fibres.octaves}`);
    turbulenceRef.current?.setAttribute("seed", `${c.fibres.seed}`);

    smearBlurRef.current?.setAttribute(
      "stdDeviation",
      `${c.blur.along * FX_SCALE} ${c.blur.across * FX_SCALE}`,
    );

    // Only present in the DOM when the glow is switched on; these are no-ops
    // otherwise.
    highlightMaskRef.current?.setAttribute(
      "values",
      warmLumaMatrix(c.color.highlightWarmth / 100),
    );
    const slope = 8;
    thresholdRef.current?.setAttribute("slope", `${slope}`);
    thresholdRef.current?.setAttribute(
      "intercept",
      `${(-slope * c.color.highlightThreshold).toFixed(4)}`,
    );
    floodRef.current?.setAttribute("flood-color", c.color.glowColor);
    glowRef.current?.setAttribute("slope", `${c.color.glowIntensity / 100}`);
    blendRef.current?.setAttribute("mode", c.color.blendMode);

    saturateRef.current?.setAttribute("values", `${c.color.saturation / 100}`);
    hueRef.current?.setAttribute("values", `${c.color.hueShift}`);
    coldRef.current?.setAttribute(
      "values",
      coldMatrix(c.color.coldDarken / 100),
    );
    subjectRef.current?.setAttribute(
      "values",
      subjectMatrix(c.color.subjectMask / 100),
    );
  }, []);

  // --- the filtered copy's decoder ------------------------------------------

  const wakeFx = useCallback(() => {
    const fx = fxVideoRef.current;
    const base = baseVideoRef.current;
    if (!fx || !base) return;
    if (fxPauseTimer.current) {
      window.clearTimeout(fxPauseTimer.current);
      fxPauseTimer.current = 0;
    }
    if (!fx.paused) return;
    // Coming back from a real pause is the one place a seek is correct: the
    // gap is arbitrary and a rate nudge would take minutes to close it.
    fx.currentTime = base.currentTime;
    void fx.play().catch(() => {});
  }, []);

  const sleepFx = useCallback(() => {
    if (fxPauseTimer.current) return;
    fxPauseTimer.current = window.setTimeout(() => {
      fxPauseTimer.current = 0;
      fxVideoRef.current?.pause();
    }, FX_IDLE_PAUSE_MS);
  }, []);

  const detach = useCallback(() => {
    if (!attached.current) return;
    attached.current = false;
    if (glRef.current) {
      // Nothing to unhook — one last pass with no focuses leaves the canvas
      // transparent, and then the loop stops.
      glRef.current.draw({ focuses: [], displacement: 0, opacity: 0 });
      return;
    }
    filterHostRef.current?.removeAttribute("filter");
    if (maskRef.current) {
      maskRef.current.style.opacity = "0";
      maskRef.current.style.removeProperty("will-change");
    }
    lastMask.current = "";
    sleepFx();
  }, [sleepFx]);

  const attach = useCallback(() => {
    if (attached.current) return;
    attached.current = true;
    if (glRef.current) return; // the shader has no attach step
    filterHostRef.current?.setAttribute("filter", `url(#${FILTER_ID})`);
    // `mask-image` is NOT a compositable property, so hinting it buys nothing
    // and costs a layer promotion on an element the size of the viewport.
    // Opacity is the one that pays.
    maskRef.current?.style.setProperty("will-change", "opacity");
    wakeFx();
  }, [wakeFx]);

  const frame = useCallback(
    (time: number) => {
      const c = heroTrailConfig;
      const now = performance.now();
      const list = samples.current;

      const dt = lastFrame.current
        ? time - lastFrame.current
        : REFERENCE_FRAME_MS;
      lastFrame.current = time;

      const follow = timeScaledLerp(c.response.followInertia, dt);
      const steer = timeScaledLerp(c.response.velocitySmoothing, dt);

      const sm = smooth.current;
      if (pointer.current.inside) {
        sm.x += (pointer.current.x - sm.x) * follow;
        sm.y += (pointer.current.y - sm.y) * follow;
      }
      // Velocity is measured per reference-frame, not per actual frame, so
      // speed means the same thing regardless of refresh rate.
      const perFrame = REFERENCE_FRAME_MS / Math.min(50, Math.max(4, dt));
      const vx = (sm.x - previous.current.x) * perFrame;
      const vy = (sm.y - previous.current.y) * perFrame;
      velocity.current.x += (vx - velocity.current.x) * steer;
      velocity.current.y += (vy - velocity.current.y) * steer;
      previous.current.x = sm.x;
      previous.current.y = sm.y;

      // Speed is still read — it drives how far pixels are dragged — but the
      // axis no longer follows it. Cursor direction used to steer the smear,
      // and the whole field visibly swung round every time the hand turned.
      const speed = Math.hypot(velocity.current.x, velocity.current.y);

      const head = list[0];
      if (
        pointer.current.inside &&
        speed >= c.response.speedThreshold &&
        (!head || Math.hypot(sm.x - head.x, sm.y - head.y) >= c.trail.minStep)
      ) {
        list.unshift({
          x: sm.x,
          y: sm.y,
          t: now,
          speed,
          dirX: direction.current.x,
          dirY: direction.current.y,
        });
        if (list.length > HERO_TRAIL_MAX_SAMPLES) {
          list.length = HERO_TRAIL_MAX_SAMPLES;
        }
      }

      while (list.length && now - list[list.length - 1]!.t >= c.trail.lifetime) {
        list.pop();
      }

      const gl = glRef.current;

      if (!list.length && energy.current < 0.01) {
        detach();
        if (gl) {
          // Keep painting: the canvas is the picture. With no focuses the mask
          // is zero everywhere and both effect passes are skipped, so this is
          // one textured quad. The loop is stopped by the visibility gate, not
          // from in here.
          focuses.current.length = 0;
          gl.draw({ focuses: focuses.current, displacement: 0, opacity: 0 });
          return;
        }
        if (!pointer.current.inside) {
          unsubscribe.current?.();
          unsubscribe.current = null;
        }
        return;
      }

      attach();

      // One gradient per sample: fresher = tighter and stronger, older = wider
      // and fainter. The ellipse elongates toward whichever screen axis the
      // cursor is moving along — a gradient cannot be tilted, so a 45° drag
      // reads as a slightly larger circle rather than a diagonal ellipse.
      const layers: string[] = [];
      const points = focuses.current;
      points.length = 0;
      let target = 0;
      const count = Math.min(c.trail.tailLength, list.length);
      for (let i = 0; i < count; i += 1) {
        const sample = list[i]!;
        const age = Math.min(1, (now - sample.t) / c.trail.lifetime);
        const weight = Math.pow(1 - age, c.trail.ageFalloff);
        const speedNorm = Math.min(
          1,
          sample.speed / Math.max(1, c.response.speedReference),
        );
        const alpha = weight * (0.35 + 0.65 * speedNorm);
        if (alpha <= 0.004) continue;

        const base = c.zone.radius * (1 + c.trail.radiusGrowth * age);
        const outer = base * (1 + c.blur.edge / 100);
        const core = Math.max(0, 1 - c.zone.edgeSoftness / 100);

        let rx = outer;
        let ry = outer;
        if (c.zone.shape === "ellipse") {
          const stretch = c.zone.stretch - 1;
          // The heading stored with THIS point, not the live one — otherwise
          // every focus in the tail re-orients at once and the whole field is
          // seen to swing round on a turn.
          rx = outer * (1 + stretch * Math.abs(sample.dirX));
          ry = outer * (1 + stretch * Math.abs(sample.dirY));
        }

        target = Math.max(target, weight * speedNorm);

        if (gl) {
          // The shader takes the ellipse itself and evaluates the same falloff
          // per pixel — no gradient strings, no rasterisation.
          points.push({ x: sample.x, y: sample.y, rx, ry, alpha });
          continue;
        }

        const stops = FALLOFF_STOPS.map((t) => {
          const position = (core + (1 - core) * t) * 100;
          return `rgba(0,0,0,${(alpha * falloff(t)).toFixed(3)}) ${position.toFixed(1)}%`;
        }).join(", ");

        layers.push(
          `radial-gradient(${rx.toFixed(1)}px ${ry.toFixed(1)}px at ${sample.x.toFixed(1)}px ${sample.y.toFixed(1)}px, ${stops})`,
        );
      }

      energy.current +=
        (target - energy.current) *
        timeScaledLerp(c.response.returnInertia, dt);

      const scaleNow =
        c.trail.strength * c.trail.speedSensitivity * energy.current;

      if (gl) {
        // One draw. Everything the frame needs is a uniform, so there is no DOM
        // write, no string building and no rasterisation on this path at all.
        gl.draw({
          focuses: points,
          displacement: scaleNow,
          opacity: c.opacity / 100,
        });
        return;
      }

      const mask = maskRef.current;
      if (mask) {
        if (!layers.length) {
          // No layer cleared the alpha floor — which happens for a frame or two
          // as the last sample expires, while the list is still non-empty. The
          // mask must go to nothing, and it has to be done with OPACITY:
          // `mask-image: none` means "no mask", i.e. fully revealed, so writing
          // it here used to flash the entire filtered frame over the picture at
          // full strength — and pay for a full-viewport filter to do it.
          if (lastMask.current !== "") {
            lastMask.current = "";
            mask.style.opacity = "0";
          }
        } else {
          // Two extra layers composited with `intersect` hold the trail off the
          // frame border, where displacement samples from beyond the footage.
          const guard = Math.max(0, c.zone.edgeGuard);
          if (guard > 0) {
            layers.push(
              `linear-gradient(to right, transparent 0, #000 ${guard}px, #000 calc(100% - ${guard}px), transparent 100%)`,
              `linear-gradient(to bottom, transparent 0, #000 ${guard}px, #000 calc(100% - ${guard}px), transparent 100%)`,
            );
          }

          const imageValue = layers.join(", ");
          if (imageValue !== lastMask.current) {
            lastMask.current = imageValue;
            mask.style.maskImage = imageValue;
            mask.style.setProperty("-webkit-mask-image", imageValue);
            if (guard > 0) {
              const composite = layers
                .map((_, i) => (i >= layers.length - 2 ? "intersect" : "add"))
                .join(", ");
              mask.style.maskComposite = composite;
            }
            mask.style.opacity = `${(c.opacity / 100).toFixed(3)}`;
          }
        }
      }

      const scale =
        c.trail.strength * c.trail.speedSensitivity * energy.current;
      const scaleValue = (scale * FX_SCALE).toFixed(2);
      if (scaleValue !== lastScale.current) {
        lastScale.current = scaleValue;
        dispRef.current?.setAttribute("scale", scaleValue);
        highlightDispRef.current?.setAttribute(
          "scale",
          (scale * c.color.highlightDisplacement * FX_SCALE).toFixed(2),
        );
      }

      // Keep the filtered copy on the picture's clock. A rate nudge, never a
      // seek — see FX_SYNC.
      const fx = fxVideoRef.current;
      const base = baseVideoRef.current;
      if (fx && base && !fx.paused && !base.paused) {
        const drift = fx.currentTime - base.currentTime;
        if (Math.abs(drift) > FX_SYNC.hardSeek) {
          fx.currentTime = base.currentTime;
          fx.playbackRate = 1;
        } else if (Math.abs(drift) > FX_SYNC.tolerance) {
          fx.playbackRate = drift > 0 ? 1 - FX_SYNC.rate : 1 + FX_SYNC.rate;
        } else if (fx.playbackRate !== 1) {
          fx.playbackRate = 1;
        }
      }
    },
    [attach, detach],
  );

  const ensureRunning = useCallback(() => {
    if (unsubscribe.current) return;
    lastFrame.current = 0;
    unsubscribe.current = subscribeToTicker(frame, () => TRAIL_MIN_FRAME_MS);
  }, [frame]);

  useEffect(() => {
    if (!effectEnabled) return;
    applyStatic();
  }, [applyStatic, effectEnabled]);

  // Bake the turbulence field for the current region. Debounced, because a drag
  // resize fires this continuously and the old field keeps working in the
  // meantime — it is a displacement map under a soft mask, so a region that is
  // briefly the wrong size is not something anyone can see mid-drag.
  useEffect(() => {
    if (!effectEnabled || !region) return;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void bakeDragMap(region.x, region.y, region.w, region.h).then((next) => {
        if (!cancelled) setDragField(next);
      });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectEnabled, region]);

  // Stand up the GPU renderer as soon as the field exists. This is the primary
  // path; the SVG filter below is what happens when it cannot be.
  useEffect(() => {
    if (!effectEnabled || !dragField || !region || glUnavailable) return;
    const canvas = glCanvasRef.current;
    const video = baseVideoRef.current;
    if (!canvas || !video) return;

    let disposed = false;
    let renderer: TrailRenderer | null = null;

    // Dynamically imported so the renderer lands in its own chunk and never
    // reaches a device that will not run it — a phone, a reduced-motion
    // visitor, or a crawler.
    void import("./hero-trail-gl")
      .then(({ createTrailRenderer }) => {
        if (disposed) return;
        // `tablet:` and `max-md:` shift the video's object-position; the shader
        // has to be told, since it is doing the cover mapping itself now.
        const positionX = window.matchMedia("(max-width: 767px)").matches
          ? 0.7
          : window.matchMedia("(min-width: 768px) and (max-width: 1279px)")
                .matches
            ? 0.74
            : 0.5;

        renderer = createTrailRenderer(canvas, video, {
          config: heroTrailConfig,
          noise: dragField,
          region,
          objectPositionX: positionX,
        });
        if (!renderer) {
          setGlUnavailable(true);
          return;
        }
        renderer.resize(size.current.w, size.current.h, positionX);
        // Prewarm: one throwaway pass so every program links and every texture
        // uploads now, while the loading cover is still up, rather than on the
        // first pointer move.
        renderer.draw({ focuses: [], displacement: 0, opacity: 0 });
        glRef.current = renderer;
        setGlLive(true);
      })
      .catch(() => setGlUnavailable(true));

    return () => {
      disposed = true;
      glRef.current = null;
      setGlLive(false);
      renderer?.dispose();
    };
  }, [dragField, effectEnabled, glUnavailable, region]);

  // The GPU canvas draws the PICTURE, not just the treatment (see the note on
  // pass 3 in hero-trail-gl.ts), so unlike the SVG path it cannot only run
  // while the pointer moves — it would freeze the footage. It runs continuously
  // instead, and is gated on the two things that actually matter: the hero
  // being on screen, and the tab being in front. With no trail up, a frame is
  // one textured quad and both effect passes are skipped.
  useEffect(() => {
    if (!glLive) return;
    const node = rootRef.current;
    if (!node) return;

    let onScreen = true;
    const sync = () => {
      if (onScreen && !document.hidden) ensureRunning();
      else {
        unsubscribe.current?.();
        unsubscribe.current = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
        sync();
      },
      // A margin so it is already running by the time it scrolls back in.
      { rootMargin: "25%" },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      unsubscribe.current?.();
      unsubscribe.current = null;
    };
  }, [ensureRunning, glLive]);

  // The SVG fallback needs the field as an image; the GL path never does.
  useEffect(() => {
    if (!glUnavailable || !dragField) return;
    let cancelled = false;
    void canvasToObjectUrl(dragField).then((url) => {
      if (cancelled || !url) return;
      setBakedDrag((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [dragField, glUnavailable]);

  // Geometry: size, the rotation pivots that depend on it, and where the hover
  // surface sits. All of it is resize/scroll work, none of it is frame work —
  // the two `transform` writes in particular used to run every frame with the
  // same value, dirtying an ancestor of the filtered subtree each time.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || !effectEnabled) return;

    const section = node.closest("section");

    const measure = () => {
      const rect = node.getBoundingClientRect();
      size.current = { w: rect.width, h: rect.height };
      glRef.current?.resize(rect.width, rect.height);

      const host = section ?? node;
      const hostRect = host === node ? rect : host.getBoundingClientRect();
      origin.current = { x: hostRect.left, y: hostRect.top };

      // Mirror of the `<filter>` region, in the filter's user space: the
      // filtered group's box is the foreignObject at FX_SCALE of the root, and
      // the region is that box grown by 8% on every side.
      const boxW = rect.width * FX_SCALE;
      const boxH = rect.height * FX_SCALE;
      // Snapped to WHOLE user units, and the `<filter>` is then given these
      // exact numbers rather than the `-8% … 116%` it used to carry.
      //
      // This alignment is the whole ballgame for the bake. `feTurbulence`
      // samples on the filter region's own pixel grid, so if the baked field
      // and the live region start at different sub-pixel offsets the noise is
      // evaluated at different points and the two disagree — measured at up to
      // 11/255 on the map, which a displacement scale of ~49 turns into about
      // two pixels of error. With both grids on whole units the baked field is
      // BIT-IDENTICAL to the live one (measured in Chrome at both 464×348 and
      // the production 836×464: SSIM 1.000000, max difference 0).
      //
      // What is NOT bit-identical is the picture downstream of it. The baked
      // field is an 8-bit PNG, and Blink hands `feTurbulence`'s own output to
      // `feDisplacementMap` at higher precision, so the displaced result drifts
      // slightly: SSIM 0.9815, max 25/255 — on a worst case of 14px stripes at
      // full displacement. Real footage is far lower frequency, the result is
      // then blurred at σ=26, masked with a soft falloff and merged OVER the
      // untouched picture, so the visible share of that is much smaller again.
      // It is a deliberate trade, not an oversight: it buys removing the single
      // most expensive primitive in the graph from every frame.
      //
      // floor/ceil rather than round, so the region is always a superset of the
      // 116% box it replaces and nothing that used to be filtered is clipped.
      const x0 = Math.floor(-0.08 * boxW);
      const y0 = Math.floor(-0.08 * boxH);
      const next = {
        x: x0,
        y: y0,
        w: Math.ceil(1.08 * boxW) - x0,
        h: Math.ceil(1.08 * boxH) - y0,
      };
      setRegion((current) =>
        current &&
        current.x === next.x &&
        current.y === next.y &&
        current.w === next.w &&
        current.h === next.h
          ? current
          : next,
      );

      const angle = heroTrailConfig.blur.angle;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      rotateRef.current?.setAttribute(
        "transform",
        `rotate(${angle.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})`,
      );
      // This group lives inside the FX_SCALE space, so its pivot must be too.
      counterRotateRef.current?.setAttribute(
        "transform",
        `rotate(${(-angle).toFixed(2)} ${(cx * FX_SCALE).toFixed(1)} ${(cy * FX_SCALE).toFixed(1)})`,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // Smooth scroll moves the section under a stationary cursor, so the cached
    // origin has to follow it.
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
    };
  }, [effectEnabled]);

  useEffect(() => {
    if (!effectEnabled) return;

    // The backdrop sits at -z-10 under the copy, so the pointer never reaches
    // it — the section is the real hover surface.
    const section = rootRef.current?.closest("section");
    if (!section) return;

    const onMove = (event: PointerEvent) => {
      pointer.current.x = event.clientX - origin.current.x;
      pointer.current.y = event.clientY - origin.current.y;
      if (!pointer.current.inside) {
        pointer.current.inside = true;
        smooth.current = { x: pointer.current.x, y: pointer.current.y };
        previous.current = { ...smooth.current };
        velocity.current = { x: 0, y: 0 };
      }
      ensureRunning();
    };
    const onLeave = () => {
      pointer.current.inside = false;
    };

    section.addEventListener("pointermove", onMove);
    section.addEventListener("pointerleave", onLeave);
    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      unsubscribe.current?.();
      unsubscribe.current = null;
      if (fxPauseTimer.current) window.clearTimeout(fxPauseTimer.current);
    };
  }, [effectEnabled, ensureRunning]);

  // --- playback ------------------------------------------------------------
  // Native `loop`, deliberately. This used to ping-pong: forwards natively,
  // then backwards by stepping `currentTime` on the shared ticker, because no
  // browser accepts a negative `playbackRate`. That meant the element sat
  // `paused` for the whole backward half — 6.5s of every 13s — with the picture
  // moved by seeking, which read as the video stalling.
  //
  // Looping natively keeps playback on the decoder's own clock, where nothing
  // the effect does can touch it. The cost is that the clip no longer plays
  // backwards; a seamless reverse needs a pre-reversed file to concatenate.
  //
  // Playback is started here rather than with an `autoPlay` attribute, because
  // `autoPlay` cannot be taken back: the element carried it while the file
  // header still says "this is what shows when motion is switched off", so a
  // visitor who asked for less motion got the clip anyway. Driving it from an
  // effect is the only way `prefers-reduced-motion` can actually hold the
  // poster — and it means no decoder at all for that visitor.
  useEffect(() => {
    const base = baseVideoRef.current;
    if (!base) return;
    if (reducedMotion) {
      base.pause();
      return;
    }
    let visible = true;
    const sync = () => {
      if (visible && !document.hidden) void base.play().catch(() => {});
      else base.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      sync();
    });
    observer.observe(base);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      base.pause();
    };
  }, [reducedMotion]);

  // The filtered copy starts paused: nothing is revealed until the pointer
  // moves, and `attach()` wakes it.
  useEffect(() => {
    if (!effectEnabled) return;
    const fx = fxVideoRef.current;
    return () => {
      fx?.pause();
    };
  }, [effectEnabled]);

  const glow = useMemo(() => hexToRgb(heroTrailConfig.color.glowColor), []);
  // Provably a no-op at 0 — see the COST note at the top of the file.
  const glowEnabled = heroTrailConfig.color.glowIntensity > 0;

  return (
    <div ref={rootRef} className="absolute inset-0 -z-10 overflow-hidden">
      {/* The poster is the LCP candidate and is served raw, so `next/image`
          never sees it — this is what gets it onto the wire in the first
          round-trip. React hoists it into <head>. */}
      <link rel="preload" as="image" href={image.src} fetchPriority="high" />

      {/* Decorative, silent backdrop — hidden from assistive tech, so it needs
          no caption track. The headline carries the meaning. */}
      <video
        ref={baseVideoRef}
        src={video.src}
        poster={image.src}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center max-md:object-[70%_center] tablet:object-[74%_center]"
      />

      {/* The GPU path. Promoted to its own compositor layer so a neighbouring
          fixed element repainting during scroll cannot invalidate the WebGL
          composite — the documented cause of whole-scene flicker on WebKit. */}
      {effectEnabled && !glUnavailable && (
        <canvas
          ref={glCanvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full transform-gpu backface-hidden"
        />
      )}

      {effectEnabled && glUnavailable && (
        <div
          ref={maskRef}
          className="absolute inset-0 opacity-0"
          style={{
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskComposite: "add",
          }}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              {/* The region is stated in user units once `measure()` has run,
                  so that it lands on whole pixels and the baked turbulence
                  above can align to it exactly. The percentage form is the
                  pre-measurement fallback and describes the same box. */}
              <filter
                id={FILTER_ID}
                filterUnits={region ? "userSpaceOnUse" : undefined}
                x={region ? region.x : "-8%"}
                y={region ? region.y : "-8%"}
                width={region ? region.w : "116%"}
                height={region ? region.h : "116%"}
                colorInterpolationFilters="sRGB"
              >
                {/* The fibre field, as a plain image. Every input to the
                    turbulence is a constant, but Blink re-evaluates a filter as
                    a whole — so three octaves of Perlin over the entire region
                    were being regenerated on every pass, of which there are one
                    per video frame plus one per attribute write. `bakeDragMap`
                    has the browser compute it once and hands the raster back
                    here, so what used to be the most expensive primitive in the
                    graph is now a texture lookup.

                    Until the bake lands — and forever, if it fails — the live
                    primitives below produce the identical `DRAG`. */}
                {bakedDrag && region ? (
                  <feImage
                    href={bakedDrag}
                    x={region.x}
                    y={region.y}
                    width={region.w}
                    height={region.h}
                    preserveAspectRatio="none"
                    result="DRAG"
                  />
                ) : (
                  <>
                    <feTurbulence
                      ref={turbulenceRef}
                      type="fractalNoise"
                      baseFrequency="0.0095 0.075"
                      numOctaves="3"
                      seed="9"
                      stitchTiles="stitch"
                      result="FIBRES"
                    />
                    {/* Raw turbulence displaces symmetrically on both axes,
                        which reads as ripple — the pushes cancel and nothing
                        stretches. R is squeezed into [0.5, 1] so displacement is
                        one-signed along the local X (= the motion vector after
                        rotation), and G is flattened to a narrow band around
                        0.5, leaving just enough lateral wander to keep the
                        fibres organic. */}
                    <feColorMatrix
                      in="FIBRES"
                      type="matrix"
                      values={DRAG_MATRIX}
                      result="DRAG"
                    />
                  </>
                )}
                <feDisplacementMap
                  ref={dispRef}
                  in="SourceGraphic"
                  in2="DRAG"
                  scale="0"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="SMEAR"
                />
                <feGaussianBlur
                  ref={smearBlurRef}
                  in="SMEAR"
                  stdDeviation="20 0"
                  result="SMEAR_SOFT"
                />

                {/* Subject gate, computed once and used asymmetrically below. */}
                <feColorMatrix
                  ref={subjectRef}
                  in="SourceGraphic"
                  type="matrix"
                  values={subjectMatrix(0.45)}
                  result="SUBJECT_RAW"
                />
                <feComposite
                  in="SUBJECT_RAW"
                  in2="SourceGraphic"
                  operator="in"
                  result="SUBJECT"
                />

                {/* The base smear is confined to the athletes — smearing the sky
                    turned it to grey mush. The GLOW deliberately is NOT confined:
                    the light ribbons have to be able to leave the bodies. */}
                <feComposite
                  in="SMEAR_SOFT"
                  in2="SUBJECT"
                  operator="in"
                  result="SMEAR_MASKED"
                />

                {glowEnabled && (
                  <>
                    {/* Warm-biased luminance into alpha. Plain
                        `luminanceToAlpha` scores bright sky as a highlight,
                        which then gets flooded orange and screened out into
                        white streaks. */}
                    <feColorMatrix
                      ref={highlightMaskRef}
                      in="SourceGraphic"
                      type="matrix"
                      values={warmLumaMatrix(0.51)}
                      result="LUMA"
                    />
                    <feComponentTransfer in="LUMA" result="THRESHOLD">
                      <feFuncA
                        ref={thresholdRef}
                        type="linear"
                        slope="8"
                        intercept="-5.6"
                      />
                    </feComponentTransfer>
                    <feComposite
                      in="SourceGraphic"
                      in2="THRESHOLD"
                      operator="in"
                      result="HIGHLIGHTS"
                    />
                    <feDisplacementMap
                      ref={highlightDispRef}
                      in="HIGHLIGHTS"
                      in2="DRAG"
                      scale="0"
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result="HIGHLIGHT_SMEAR"
                    />
                    <feFlood
                      ref={floodRef}
                      floodColor={`rgb(${glow.r} ${glow.g} ${glow.b})`}
                      result="WARM"
                    />
                    <feComposite
                      in="WARM"
                      in2="HIGHLIGHT_SMEAR"
                      operator="in"
                      result="WARM_HIGHLIGHTS"
                    />
                    <feComponentTransfer in="WARM_HIGHLIGHTS" result="GLOW">
                      <feFuncA
                        ref={glowRef}
                        type="linear"
                        slope="1"
                        intercept="0"
                      />
                    </feComponentTransfer>
                    <feBlend
                      ref={blendRef}
                      in="SMEAR_MASKED"
                      in2="GLOW"
                      mode="soft-light"
                      result="LIT"
                    />
                  </>
                )}

                {/* Three matrices, deliberately NOT one — see the COST note at
                    the top of the file. The clamp between them is load-bearing. */}
                <feColorMatrix
                  ref={saturateRef}
                  in={glowEnabled ? "LIT" : "SMEAR_MASKED"}
                  type="saturate"
                  values="1.3"
                  result="SAT"
                />
                <feColorMatrix
                  ref={hueRef}
                  in="SAT"
                  type="hueRotate"
                  values="-6"
                  result="HUE"
                />
                <feColorMatrix
                  ref={coldRef}
                  in="HUE"
                  type="matrix"
                  values={coldMatrix(0.25)}
                  result="GRADED"
                />
                {/* Clip to the footage's own alpha — displacement samples from
                    beyond the frame edge — then lay the treatment over the
                    untouched picture. */}
                <feComposite
                  in="GRADED"
                  in2="SourceGraphic"
                  operator="in"
                  result="GRADED_CLIPPED"
                />
                <feMerge>
                  <feMergeNode in="SourceGraphic" />
                  <feMergeNode in="GRADED_CLIPPED" />
                </feMerge>
              </filter>
            </defs>

            <g ref={rotateRef}>
              {/* Everything below is authored at FX_SCALE and scaled back up, so
                  the filter rasterises a quarter of the pixels. */}
              <g transform={`scale(${1 / FX_SCALE})`}>
                <g ref={filterHostRef}>
                  {/* The filtered copy has to be the same moving footage, not a
                      still, or the smear would be of a frozen frame sitting over
                      a playing video. An SVG <image> cannot show video, hence the
                      foreignObject.

                      It gets its OWN, smaller encode: this box is never larger
                      than half the viewport and everything in it is blurred and
                      displaced, so the full-size file was a second decoder's
                      worth of work for detail the filter destroys. */}
                  <g ref={counterRotateRef}>
                    <foreignObject
                      x="0"
                      y="0"
                      width={`${FX_SCALE * 100}%`}
                      height={`${FX_SCALE * 100}%`}
                    >
                      <video
                        ref={fxVideoRef}
                        src={video.fxSrc}
                        poster={image.src}
                        muted
                        loop
                        playsInline
                        preload="auto"
                        disablePictureInPicture
                        aria-hidden="true"
                        className="h-full w-full object-cover object-center max-md:object-[70%_center] tablet:object-[74%_center]"
                      />
                    </foreignObject>
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </div>
      )}
    </div>
  );
};
