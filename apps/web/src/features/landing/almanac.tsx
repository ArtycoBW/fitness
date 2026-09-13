"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { PublicItem } from "./types";
// GetLayers Cards Almanac: CSS sticky order and calibrated incline/depth constants.
const S = {
  baseVh: 5,
  peekPx: 34,
  gapVh: 46,
  revealPx: 480,
  revealAt: 0.5,
  persp: 1500,
  arriveTilt: 15,
  buriedTilt: 3,
  scaleStep: 0.035,
  dimStep: 0.02,
  liftPx: 4,
};
export function Almanac({ items }: { items: PublicItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cards = Array.from(
      root.current?.querySelectorAll<HTMLElement>(".almanac-card") ?? [],
    );
    if (!cards.length) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      shown = cards.map(() => false);
    let tops: number[] = [],
      height = 400,
      raf = 0;
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const layout = () => {
      height = cards[0]!.offsetHeight;
      const base = Math.max(
        (innerHeight - height) / 2 - ((cards.length - 1) / 2) * S.peekPx,
        (innerHeight * S.baseVh) / 100,
      );
      tops = cards.map((el, i) => {
        const t = Math.round(base + i * S.peekPx);
        el.style.top = t + "px";
        return t;
      });
    };
    const update = () => {
      raf = 0;
      const positions = cards.map((el) => el.getBoundingClientRect().top),
        risen = positions.map((t, i) =>
          clamp((tops[i]! + S.revealPx - t) / S.revealPx),
        );
      let suffix = 0;
      for (let i = cards.length - 1; i >= 0; i--) {
        const el = cards[i]!,
          b = suffix;
        el.style.transform = media.matches
          ? ""
          : `perspective(${S.persp}px) translateY(${-b * S.liftPx}px) rotateX(${S.arriveTilt * (1 - risen[i]!) - S.buriedTilt * b}deg) scale(${1 - S.scaleStep * b})`;
        el.style.filter = media.matches
          ? ""
          : `brightness(${1 - S.dimStep * b})`;
        el.style.zIndex = String(10 + i);
        if (!shown[i] && positions[i]! <= innerHeight - S.revealAt * height) {
          el.classList.add("is-in");
          shown[i] = true;
        } else if (shown[i] && positions[i]! >= innerHeight - 0.04 * height) {
          el.classList.remove("is-in");
          shown[i] = false;
        }
        suffix += risen[i]!;
      }
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const resize = () => {
      layout();
      queue();
    };
    layout();
    update();
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", resize);
    media.addEventListener("change", queue);
    const ro = new ResizeObserver(resize);
    cards.forEach((el) => ro.observe(el));
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", queue);
      removeEventListener("resize", resize);
      media.removeEventListener("change", queue);
      ro.disconnect();
    };
  }, [items]);
  return (
    <div ref={root} className="almanac-stack">
      {items.map((t, i) => (
        <article className="almanac-card" key={t.id}>
          <div
            className="almanac-media"
            style={{
              backgroundColor: ["#cfe7d3", "#b6ced5", "#e1f4df"][i % 3],
            }}
          >
            {t.avatarUrl ? (
              <img
                className="almanac-cover"
                src={t.avatarUrl}
                alt={t.name}
                loading="lazy"
              />
            ) : (
              <div className="trainer-monogram" aria-hidden="true">
                <span>
                  {t.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <svg viewBox="0 0 200 250">
                  <path
                    d="M20 240Q180 120 90 5M80 165Q15 95 5 70Q88 62 80 165M115 115Q190 78 195 15Q107 20 115 115"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                </svg>
              </div>
            )}
          </div>
          <div className="almanac-body">
            <span className="eyebrow">
              ТРЕНЕР / {String(i + 1).padStart(2, "0")}
            </span>
            <h3>{t.name}</h3>
            <p>{t.bio}</p>
          </div>
          <div className="almanac-foot">
            <span>{t.specialties?.join(" · ")}</span>
            <Link
              aria-label={"Подробнее: " + t.name}
              href={"/trainers/" + t.slug}
              className="round-link"
            >
              ↗
            </Link>
          </div>
        </article>
      ))}
      <div className="almanac-tail" aria-hidden="true" />
    </div>
  );
}
