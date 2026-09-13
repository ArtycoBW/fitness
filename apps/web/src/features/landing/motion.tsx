"use client";
import { useEffect } from "react";
export function LandingMotion() {
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    let cancelled = false;
    let engine: typeof import("gsap").gsap | undefined;
    const show = () =>
      targets.forEach((el) => {
        engine?.killTweensOf(el);
        el.style.removeProperty("opacity");
        el.style.removeProperty("transform");
      });
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          void import("gsap").then(({ gsap }) => {
            if (cancelled || media.matches) return;
            engine = gsap;
            gsap.fromTo(
              entry.target,
              { opacity: 0, y: 24 },
              {
                opacity: 1,
                y: 0,
                duration: 0.85,
                ease: "power3.out",
                clearProps: "opacity,transform",
              },
            );
          });
        }
      },
      { threshold: 0.12 },
    );
    targets.forEach((el) => observer.observe(el));
    const reduce = () => {
      if (media.matches) {
        observer.disconnect();
        show();
      }
    };
    media.addEventListener("change", reduce);
    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener("change", reduce);
      show();
    };
  }, []);
  return null;
}
