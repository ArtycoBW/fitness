"use client";

import { useEffect } from "react";
export function LandingMotion() {
  useEffect(() => {
    let dispose = () => {},
      cancelled = false;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          document
            .querySelectorAll<HTMLElement>("[data-reveal]")
            .forEach((el) => {
              gsap.fromTo(
                el,
                { opacity: 0, y: 38 },
                {
                  opacity: 1,
                  y: 0,
                  ease: "none",
                  scrollTrigger: {
                    trigger: el,
                    start: "top 94%",
                    end: "top 68%",
                    scrub: 0.55,
                  },
                },
              );
            });
          document
            .querySelectorAll<HTMLElement>(".landing-main > section")
            .forEach((section) => {
              const content = section.querySelector<HTMLElement>(".hero-copy");
              if (content)
                gsap.to(content, {
                  opacity: 0,
                  y: -24,
                  ease: "none",
                  scrollTrigger: {
                    trigger: section,
                    start: "bottom 28%",
                    end: "bottom top",
                    scrub: 0.5,
                  },
                });
            });
        });
        dispose = () => mm.revert();
      },
    );
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);
  return null;
}
