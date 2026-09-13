// 📖 Docs: obsidian/frontend/animation-system.md
//
// Timing and shape for the hero's entrance: streaks cross first, the copy
// arrives in their wake. Also holds the two numbers every TextEngine block in
// the section needs — see `heroWordGap`.

/**
 * `spring-text-engine` lays words out as flex items, so the gap between them is
 * a `column-gap` and its default (0.3em) is wider than Geist's own space. Left
 * alone it re-wraps text: it turned the 3-line headline into 4. These are the
 * measured space advances, already net of the design's -0.04em tracking.
 * See obsidian/frontend/text-engine.md → "The word gap is a column-gap".
 */
export const heroWordGap = {
  /** Weight 700 — the display headline. */
  display: 0.188,
  /** Weight 400 — eyebrow, lead, nav. */
  regular: 0.21,
} as const;

export interface HeroStreak {
  /** Vertical position across the copy block, %. */
  top: number;
  /** Length as a share of the block's width, %. */
  length: number;
  thickness: number;
  opacity: number;
  delayMs: number;
}

export interface HeroRevealConfig {
  /** How long one streak takes to cross, ms. */
  streakTravelMs: number;
  streaks: HeroStreak[];
  /** When each block of copy starts, ms from mount. */
  delay: {
    nav: number;
    eyebrow: number;
    headline: number;
    lead: number;
    actions: number;
    assurances: number;
  };
  /** Between consecutive nav links, ms. */
  navStagger: number;
  /** Per-layer travel of the copy reveal, ms. */
  duration: {
    line: number;
    word: number;
  };
  stagger: {
    headlineLine: number;
    leadWord: number;
  };
}

export const heroRevealConfig: HeroRevealConfig = {
  streakTravelMs: 900,

  // Uneven on every axis on purpose — matched lengths at even spacing read as
  // a loading bar, not as a wake.
  streaks: [
    { top: 14, length: 46, thickness: 1, opacity: 0.5, delayMs: 0 },
    { top: 31, length: 78, thickness: 1, opacity: 0.32, delayMs: 90 },
    { top: 47, length: 34, thickness: 2, opacity: 0.6, delayMs: 40 },
    { top: 63, length: 62, thickness: 1, opacity: 0.28, delayMs: 190 },
    { top: 79, length: 88, thickness: 1, opacity: 0.42, delayMs: 140 },
    { top: 92, length: 40, thickness: 1, opacity: 0.24, delayMs: 260 },
  ],

  // Each block starts while the streak over it is still travelling, so the copy
  // looks uncovered by the wake rather than triggered after it.
  delay: {
    // The header settles first and quickly — it frames the shot, it is not the
    // message. The copy then arrives underneath it.
    nav: 120,
    eyebrow: 260,
    headline: 380,
    lead: 700,
    actions: 900,
    assurances: 1020,
  },
  navStagger: 70,
  duration: { line: 900, word: 700 },
  stagger: { headlineLine: 110, leadWord: 34 },
};

/**
 * Hover, shared by the nav and the buttons so every pointer response in the
 * hero has the same weight. Tension high enough to feel immediate, friction
 * high enough not to wobble — a wobble on a CTA reads as a toy.
 */
export const heroHoverConfig = {
  spring: { tension: 320, friction: 26 },
  /** The invert wipe across the primary button. */
  wipe: { tension: 260, friction: 30 },
  /** How far the primary's arrow runs along the brand diagonal, px. */
  arrowNudge: 5,
  /** The nav rule's travel, and how far its label leans into the hover, px. */
  navLabelNudge: 2,
} as const;

/**
 * The compact menu. Timings are the brief's: the panel takes 250ms to arrive
 * and the items follow it 40ms apart.
 */
export const heroMenuConfig = {
  panelMs: 250,
  itemMs: 420,
  itemStaggerMs: 40,
} as const;
