// 📖 Docs: obsidian/frontend/components/common.md
//
// Every tunable number for the cursor-trail effect.

export type HeroTrailShape = "circle" | "ellipse";
export type HeroTrailBlend = "screen" | "lighten" | "overlay" | "soft-light";

export interface HeroTrailConfig {
  zone: {
    /** px radius of one focus. */
    radius: number;
    /** 0 = hard-edged disc, 100 = the falloff starts at the very centre. */
    edgeSoftness: number;
    shape: HeroTrailShape;
    /** Only meaningful for `ellipse`. */
    stretch: number;
    /**
     * px of frame edge the effect is kept away from. Displacement near the
     * border samples from outside the footage, where there is nothing, and
     * drags that emptiness inward as bright streaks.
     */
    edgeGuard: number;
  };
  trail: {
    strength: number;
    speedSensitivity: number;
    tailLength: number;
    /** Travel before a new sample is recorded — too small and a fast flick
     *  stacks samples on one spot, which shortens the visible tail. */
    minStep: number;
    lifetime: number;
    /** Exponent on the age falloff. */
    ageFalloff: number;
    /** Positive widens a focus as it ages, negative tapers it. */
    radiusGrowth: number;
  };
  fibres: {
    /** feTurbulence baseFrequency along the motion vector (sparse = long fibres). */
    anisotropyX: number;
    /** …and across it (dense = thin fibres). */
    anisotropyY: number;
    octaves: number;
    seed: number;
  };
  color: {
    glowColor: string;
    glowIntensity: number;
    /** Luminance above which a pixel is dragged further, 0–1. */
    highlightThreshold: number;
    /**
     * How much the highlight test is biased toward warm pixels, 0–100. At 0 it
     * is plain luminance, which counts bright sky as a highlight, floods it
     * orange and screens it out into white streaks.
     */
    highlightWarmth: number;
    highlightDisplacement: number;
    blendMode: HeroTrailBlend;
    saturation: number;
    hueShift: number;
    /** Deepens blue-dominant pixels so the sky inside the trail reads denser. */
    coldDarken: number;
    /**
     * 0–100. How strongly the smear is confined to the athletes rather than
     * applied evenly. Not part of the restored payload — see the note on the
     * defaults below.
     */
    subjectMask: number;
  };
  blur: {
    along: number;
    across: number;
    /** Extends the mask falloff past the nominal radius. */
    edge: number;
    /**
     * Smear axis in degrees, **fixed**. Negative points up-to-the-right on
     * screen, matching the direction the athletes run.
     *
     * The axis used to track cursor velocity, which made the whole field
     * rotate as the hand turned. It is locked now: speed still drives how far
     * pixels are dragged, but never which way.
     */
    angle: number;
  };
  response: {
    followInertia: number;
    returnInertia: number;
    /** Smoothing on the velocity vector — governs how quickly speed reacts. */
    velocitySmoothing: number;
    /** Cursor speed below which nothing happens at all. */
    speedThreshold: number;
    /** px/frame treated as full tilt when normalising speed. */
    speedReference: number;
  };
  /** Master fader for the whole effect. */
  opacity: number;
}

/** Hard ceiling on buffered positions. */
export const HERO_TRAIL_MAX_SAMPLES = 32;

export const heroTrailConfig: HeroTrailConfig = {
  zone: {
    radius: 230,
    edgeSoftness: 100,
    shape: "ellipse",
    stretch: 1.8,
    edgeGuard: 0,
  },
  trail: {
    strength: 115,
    speedSensitivity: 0.85,
    tailLength: 12,
    // 12 × 10px spans 120px of travel instead of 84px. Spacing the same number
    // of samples further apart lengthens the streak without adding any — the
    // cheapest way there is to buy a longer trail.
    minStep: 10,
    lifetime: 2000,
    ageFalloff: 4,
    radiusGrowth: 0,
  },
  fibres: { anisotropyX: 0.0095, anisotropyY: 0.075, octaves: 3, seed: 9 },
  color: {
    glowColor: "#ff9500",
    // Off. The warm flood was reading as bright orange streaks wherever the
    // cursor crossed a highlight, which is not the effect anyone wanted. It is
    // the only consumer of `GLOW` — one `feBlend … mode="soft-light"` — and a
    // soft-light against a fully transparent layer leaves its backdrop exactly
    // as it was, so zeroing this removes the orange and touches nothing else.
    glowIntensity: 0,
    highlightThreshold: 0.7,
    highlightWarmth: 51,
    highlightDisplacement: 2.2,
    blendMode: "soft-light",
    saturation: 130,
    hueShift: -6,
    coldDarken: 25,
    // Absent from the restored payload — it postdates that snapshot. Kept at
    // the value it had when the effect was last in this state.
    subjectMask: 45,
  },
  // `along` is the primary motion cue — it is the directional smear itself.
  blur: { along: 52, across: 0, edge: 12, angle: -18 },
  response: {
    followInertia: 0.5,
    returnInertia: 0.15,
    // Also absent from the payload; postdates it as well.
    velocitySmoothing: 0.14,
    speedThreshold: 6,
    speedReference: 34,
  },
  opacity: 100,
};
