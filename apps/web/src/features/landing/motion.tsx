"use client";
import { useEffect } from "react";
import { gsap } from "gsap";
export function LandingMotion() {
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const ctx = gsap.context(() => {
      targets.forEach((el) => gsap.set(el, { opacity: 0, y: 24 }));
    });
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, {
              opacity: 1,
              y: 0,
              duration: 0.85,
              ease: "power3.out",
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    targets.forEach((el) => observer.observe(el));
    const reduce = () => {
      if (media.matches) {
        observer.disconnect();
        targets.forEach((el) => {
          gsap.killTweensOf(el);
          gsap.set(el, { clearProps: "opacity,transform" });
        });
      }
    };
    media.addEventListener("change", reduce);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", reduce);
      targets.forEach((el) => gsap.killTweensOf(el));
      ctx.revert();
    };
  }, []);
  return null;
}
