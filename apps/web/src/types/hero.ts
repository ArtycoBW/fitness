// 📖 Docs: obsidian/frontend/components/common.md

/** Which inline glyph renders next to a piece of hero copy. */
export type HeroIcon =
  "focus" | "globe" | "star" | "signal" | "expand" | "play";

export interface HeroNavLink {
  label: string;
  href: string;
}

export interface HeroMedia {
  src: string;
  /** Empty string marks the image as decorative. */
  alt: string;
  width: number;
  height: number;
}

/**
 * A backdrop clip in its two encodes.
 *
 * The hero decodes the footage **twice** — once for the picture, once inside
 * the SVG filter — and there is no way around that: SVG cannot take a running
 * `<video>` as a filter input without its own element. So the second decode is
 * given its own, much smaller file. It is only ever drawn into a half-viewport
 * box and is then blurred and displaced, so nothing of the extra resolution
 * survives; paying full price for it was simply two decoders' worth of work for
 * one decoder's worth of picture.
 */
export interface HeroVideo {
  /** Full-size encode — the picture the visitor actually looks at. */
  src: string;
  /** Reduced encode fed to the filter. Never seen at 1:1. */
  fxSrc: string;
}

/** A label/value pair in the live stats panel, e.g. "Average Pace — 4:11 /km". */
export interface HeroStat {
  id: string;
  label: string;
  value: string;
  /** Trailing unit, rendered muted next to the value. */
  unit?: string;
}

/** A trust marker on the hairline rule below the buttons. */
export interface HeroAssurance {
  id: string;
  label: string;
  icon: HeroIcon;
}

export interface HeroAction {
  label: string;
  href: string;
}

export interface HeroLiveCard {
  label: string;
  preview: HeroMedia;
  stats: HeroStat[];
}

export interface HeroContent {
  wordmark: HeroMedia;
  tagline: string;
  nav: HeroNavLink[];
  eyebrow: string;
  headline: string;
  /**
   * The headline broken into its authored lines. The words are identical to
   * `headline` — this only fixes WHERE it breaks, because auto-wrap put a
   * one-word line ("starts") in the middle of the mobile layout. Rendered as
   * block lines; `headline` stays the single source for the accessible name.
   */
  headlineLines: readonly string[];
  lead: string;
  primaryAction: HeroAction;
  secondaryAction: HeroAction;
  assurances: HeroAssurance[];
  background: HeroMedia;
  /**
   * Looping backdrop clip. `background` doubles as its poster, so the frame is
   * filled before the first video frame decodes and whenever motion is off.
   */
  backgroundVideo: HeroVideo;
  liveCard: HeroLiveCard;
}
