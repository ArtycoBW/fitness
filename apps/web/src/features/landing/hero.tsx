"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Pause, Play } from "lucide-react";
import { gsap } from "gsap";
import { HeroTrail } from "./stride/hero-trail";
import { HeroAirflow } from "./stride/hero-airflow";
import { heroRevealConfig } from "./stride/hero-reveal.config";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
export function Hero({
  workoutCount,
  hallCount,
}: {
  workoutCount: number;
  hallCount: number;
}) {
  const root = useRef<HTMLElement>(null),
    [paused, setPaused] = useState(false),
    reduced = usePrefersReducedMotion();
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (reduced) return;
    const ctx = gsap.context(() => {
      const d = heroRevealConfig.delay;
      gsap.from(".hero-kicker", {
        opacity: 0,
        y: 12,
        duration: 0.7,
        delay: d.eyebrow / 1000,
      });
      gsap.from(".hero-line", {
        opacity: 0,
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
    return () => ctx.revert();
  }, [reduced]);
  return (
    <section ref={root} className="stride-hero" aria-labelledby="hero-title">
      <HeroTrail
        paused={paused}
        image={{
          src: "/media/stride/sprinters.webp",
          alt: "",
          width: 1264,
          height: 704,
        }}
        video={{ src: "/media/runners.mp4", fxSrc: "/media/runners.fx.mp4" }}
      />
      {!paused && <HeroAirflow />}
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-topline">
        <span>СТРАЙД / КЛУБ ДВИЖЕНИЯ</span>
        <button
          type="button"
          className="hero-pause"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "Продолжить видео" : "Приостановить видео"}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
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
            <Link href="/schedule" className="landing-button light">
              Выбрать тренировку <ArrowUpRight size={18} />
            </Link>
            <a href="#club" className="hero-secondary">
              Узнать клуб <ArrowDown size={17} />
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
          <a href="#contact">
            Познакомиться с клубом <ArrowUpRight size={17} />
          </a>
        </aside>
      </div>
      <a
        className="hero-scroll"
        href="#club"
        aria-label="Перейти к знакомству с клубом"
      >
        <ArrowDown size={18} />
      </a>
    </section>
  );
}
