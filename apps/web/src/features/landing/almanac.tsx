"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicItem } from "./types";
import { trainerPhoto } from "./media";
export function Almanac({ items }: { items: PublicItem[] }) {
  const root = useRef<HTMLDivElement>(null),
    [active, setActive] = useState(0);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const cards = [...node.querySelectorAll<HTMLElement>(".almanac-card")];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      current = -1;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(
          items.length - 1,
          (-rect.top / Math.max(1, rect.height - innerHeight)) *
            (items.length - 1),
        ),
      );
      const index = Math.min(items.length - 1, Math.floor(progress + 0.55));
      cards.forEach((card, i) => {
        const incoming = Math.max(0, Math.min(1, i - progress));
        const buried = Math.max(0, progress - i);
        card.style.transform = reduce.matches
          ? "none"
          : `perspective(1500px) translateY(${incoming * 115}%) translateY(${Math.min(buried, 2) * -12}px) rotateX(${incoming * 15 - Math.min(buried, 2) * 2}deg) scale(${1 - Math.min(buried, 2) * 0.035})`;
        card.style.filter = reduce.matches
          ? "none"
          : `brightness(${1 - Math.min(buried, 3) * 0.035})`;
        card.style.visibility =
          i > Math.ceil(progress) ||
          buried > 3 ||
          (reduce.matches && i !== index)
            ? "hidden"
            : "visible";
        card.classList.toggle("is-in", incoming < 0.55);
        card.inert = i !== index;
      });
      if (index !== current) {
        current = index;
        setActive(index);
      }
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    reduce.addEventListener("change", queue);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
      reduce.removeEventListener("change", queue);
    };
  }, [items.length]);
  const go = (index: number) => {
    const node = root.current;
    if (!node) return;
    scrollTo({
      top:
        scrollY +
        node.getBoundingClientRect().top +
        (index * (node.offsetHeight - innerHeight)) /
          Math.max(1, items.length - 1),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return (
    <div
      ref={root}
      className="almanac-scroll"
      style={{ height: `${100 + Math.max(0, items.length - 1) * 70}dvh` }}
    >
      <div className="almanac-viewport">
        <div className="section-heading">
          <h2>
            Внимание к вам.
            <br />
            <em>Знание своего дела.</em>
          </h2>
          <div className="almanac-navigation">
            <span aria-live="polite">
              {String(active + 1).padStart(2, "0")} /{" "}
              {String(items.length).padStart(2, "0")}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={!active}
              onClick={() => go(active - 1)}
              aria-label="Предыдущий тренер"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={active === items.length - 1}
              onClick={() => go(active + 1)}
              aria-label="Следующий тренер"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="almanac-stack">
          {items.map((t, i) => (
            <article
              className={"almanac-card" + (i === 0 ? " is-in" : "")}
              key={t.id}
              style={{ zIndex: 10 + i }}
              aria-label={t.name}
            >
              <div className="almanac-media">
                <img
                  className="almanac-cover"
                  src={t.avatarUrl || trainerPhoto(t.name)}
                  alt={t.name}
                  loading="lazy"
                  width={1200}
                  height={1600}
                />
              </div>
              <div className="almanac-body">
                <span className="eyebrow">{t.specialties?.join(" / ")}</span>
                <h3>{t.name}</h3>
                <p>{t.bio}</p>
              </div>
              <div className="almanac-foot">
                <Button asChild>
                  <Link href={"/schedule?trainerId=" + t.id}>
                    Занятия с тренером
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href={"/trainers/" + t.slug}>О тренере</Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
