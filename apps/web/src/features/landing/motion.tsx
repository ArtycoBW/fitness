"use client";

import { useEffect } from "react";
export function LandingMotion() {
  useEffect(() => {
    document.documentElement.classList.add("stride-scroll");
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
                  duration: 1.35,
                  ease: "power2.out",
                  scrollTrigger: {
                    trigger: el,
                    start: "top 88%",
                    toggleActions: "play none none reverse",
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
      document.documentElement.classList.remove("stride-scroll");
      cancelled = true;
      dispose();
    };
  }, []);
  return null;
}
