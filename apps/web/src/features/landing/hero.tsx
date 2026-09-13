"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { heroRevealConfig } from "./stride/hero-reveal.config";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useHasHover } from "@/hooks/use-has-hover";
const HeroTrail = lazy(() =>
  import("./stride/hero-trail").then((m) => ({ default: m.HeroTrail })),
);
const HeroAirflow = lazy(() =>
  import("./stride/hero-airflow").then((m) => ({ default: m.HeroAirflow })),
);
export function Hero({
  workoutCount,
  hallCount,
}: {
  workoutCount: number;
  hallCount: number;
}) {
  const root = useRef<HTMLElement>(null),
    [paused, setPaused] = useState(false),
    [playRequested, setPlayRequested] = useState(false),
    reduced = usePrefersReducedMotion();
  const hasHover = useHasHover();
  const playbackPaused = paused || (!hasHover && !playRequested);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (reduced || !hasHover) return;
    let cancelled = false;
    let ctx: { revert(): void } | undefined;
    void import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        const d = heroRevealConfig.delay;
        gsap.from(".hero-kicker", {
          opacity: 0,
          y: 12,
          duration: 0.7,
          delay: d.eyebrow / 1000,
        });
        if (window.matchMedia("(min-width: 768px)").matches)
          gsap.from(".hero-line", {
            // Keep the server-rendered headline visible while its entrance moves.
            y: 42,
            duration: heroRevealConfig.duration.line / 1000,
            stagger: heroRevealConfig.stagger.headlineLine / 1000,
            delay: d.headline / 1000,
            ease: "power3.out",
          });
        gsap.from(".hero-lead", {
          opacity: 0,
          y: 16,
          duration: 0.7,
          delay: d.lead / 1000,
        });
        gsap.from(".hero-actions", {
          opacity: 0,
          y: 16,
          duration: 0.7,
          delay: d.actions / 1000,
        });
        gsap.from(".hero-card", {
          opacity: 0,
          y: 30,
          duration: 0.9,
          delay: (d.assurances + 220) / 1000,
        });
      }, el);
    });
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [reduced, hasHover]);
  return (
    <section
      id="home"
      ref={root}
      className="stride-hero"
      aria-labelledby="hero-title"
    >
      <link
        rel="preload"
        as="image"
        href="/media/stride/sprinters.webp"
        fetchPriority="high"
      />
      {(hasHover || playRequested) && (
        <Suspense fallback={null}>
          <HeroTrail
            paused={playbackPaused}
            image={{
              src: "/media/stride/sprinters.webp",
              alt: "",
              width: 1264,
              height: 704,
            }}
            video={{
              src: "/media/runners.mp4",
              fxSrc: "/media/runners.fx.mp4",
            }}
          />
        </Suspense>
      )}
      {!playbackPaused && (
        <Suspense fallback={null}>
          <HeroAirflow />
        </Suspense>
      )}
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-topline">
        <span>СТРАЙД / КЛУБ ДВИЖЕНИЯ</span>
        <Button
          variant="ghost"
          type="button"
          className="hero-pause"
          onClick={() => {
            setPlayRequested(true);
            setPaused(!playbackPaused);
          }}
          aria-label={
            playbackPaused ? "Продолжить видео" : "Приостановить видео"
          }
        >
          {playbackPaused ? <Play size={16} /> : <Pause size={16} />}
        </Button>
      </div>
      <div className="hero-bottom">
        <div className="hero-copy">
          <p className="hero-kicker">СИЛА БЫТЬ СОБОЙ</p>
          <h1 id="hero-title">
            <span className="hero-line">Движение</span>
            <span className="hero-line">в вашем</span>
            <em className="hero-line">ритме.</em>
          </h1>
          <p className="hero-lead">
            Больше энергии для жизни за пределами зала. Тренируйтесь, пробуйте
            новое и находите свой темп.
          </p>
          <div className="hero-actions">
            <Link href="#timetable" className="landing-button light">
              Выбрать тренировку
            </Link>
            <a href="#club" className="hero-secondary">
              Узнать клуб
            </a>
          </div>
        </div>
        <aside className="hero-card">
          <span className="eyebrow">МЕСТО ДЛЯ ВАШЕГО СТАРТА</span>
          <h2>
            Каждый шаг
            <br />
            имеет значение.
          </h2>
          <div className="hero-card-numbers">
            <div>
              <strong>{workoutCount || "—"}</strong>
              <span>направлений</span>
            </div>
            <div>
              <strong>{hallCount || "—"}</strong>
              <span>зала</span>
            </div>
          </div>
          <p>Выберите занятие, а мы поможем освоиться.</p>
          <a href="#contact">Познакомиться с клубом</a>
        </aside>
      </div>
    </section>
  );
}
