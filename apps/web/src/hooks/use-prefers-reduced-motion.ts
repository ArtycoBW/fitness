/**
 * Whether the visitor has asked the OS to reduce motion.
 *
 * The companion to `use-has-hover`, and read the same way: as a *render* gate,
 * not just a guard inside an effect. The difference matters — the hero's
 * effects each carry their own `<video>` and canvas, and a component that
 * mounts its DOM and then declines to animate it still pays for the element.
 * Returning the answer as state lets the caller decline to render it at all.
 *
 * Starts `true` so motion stays off until the visitor preference is known, then settles
 * in an effect.
 *
 * 📖 Docs: obsidian/frontend/hooks.md
 */

"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
};
