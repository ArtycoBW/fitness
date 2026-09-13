// 📖 Docs: obsidian/frontend/components/common.md
//
// Tunables for the airflow streamlines drawn over the hero. Purely additive —
// this layer knows nothing about the trail effect underneath it.

/** An inclusive [min, max] range; every line samples its own value from it. */
export type Range = readonly [number, number];

export interface HeroAirflowConfig {
  /** Radius (px) of the area around the cursor where air becomes visible. */
  radius: number;
  /**
   * Flow direction in degrees, fixed. Mirrors `blur.angle` in
   * hero-trail.config.ts so both layers lie on the same diagonal — keep the
   * two in sync by hand if either moves.
   */
  angleDeg: number;
  /** How far the layer trails the cursor, ms. */
  lagMs: number;
  /** Ceiling on simultaneous lines. */
  maxLines: number;
  /** Lines born per second when the cursor is at full tilt. */
  spawnPerSecond: number;
  /** Cursor speed treated as full tilt, px per 60fps frame. */
  speedReference: number;

  lifeMs: Range;
  /** Line length at rest and at full speed, px. */
  lengthPx: Range;
  thicknessPx: Range;
  /** Lateral bow of the curve, px. Straight lines read as drawn stripes. */
  curvePx: Range;
  /** Spread around the flow direction, degrees. Keeps them from looking combed. */
  angleJitterDeg: number;
  /** How fast a line slides along its own direction, px/second. */
  driftPxPerSecond: Range;
  /** Peak alpha of a single line. */
  alpha: Range;

  color: string;
  /** Width multiplier of the soft halo stroke drawn under each line. */
  glowWidth: number;
  /** Alpha multiplier of that halo. */
  glowAlpha: number;
  /**
   * Alpha multiplier of the narrow core stroke. Below 1 on purpose: a crisp
   * bright centre is what made these read as hairs rather than as air.
   */
  coreAlpha: number;

  /** Time constants for the layer coming up and letting go, ms. */
  riseMs: number;
  fallMs: number;
  /** Backing-store scale. */
  renderScale: number;
}

export const heroAirflowConfig: HeroAirflowConfig = {
  radius: 300,
  angleDeg: -18,
  lagMs: 140,
  maxLines: 72,
  spawnPerSecond: 58,
  speedReference: 26,

  lifeMs: [700, 1500],
  lengthPx: [90, 300],
  thicknessPx: [3, 9],
  curvePx: [10, 46],
  angleJitterDeg: 7,
  driftPxPerSecond: [45, 140],
  alpha: [0.03, 0.09],

  // Not pure white — a hair's breadth warm, so the lines sit in the footage
  // instead of on top of it.
  color: "#f2efe9",
  glowWidth: 4.2,
  glowAlpha: 0.5,
  coreAlpha: 0.5,

  riseMs: 200,
  fallMs: 420,
  renderScale: 0.85,
};
