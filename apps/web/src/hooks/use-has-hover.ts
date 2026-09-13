/**
 * Whether this device has a real hovering pointer.
 *
 * Deliberately a capability query, not a width query: touchscreen laptops are
 * wide *and* coarse, and a phone in landscape is neither. Anything that promises
 * pointer interaction — the speed trail, the airflow, the "move to focus" label
 * — has to read this rather than a breakpoint.
 *
 * Starts `false` so the first client render matches the server's, then settles
 * on the real answer in an effect. That order matters: the consumers use it to
 * decide whether to *initialise* an effect at all, and initialising then tearing
 * down would defeat the point.
 */

"use client";

import { useEffect, useState } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

export const useHasHover = (): boolean => {
  const [hasHover, setHasHover] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const sync = () => setHasHover(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return hasHover;
};
