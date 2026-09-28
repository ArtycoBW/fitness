"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function Hero() {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (paused || reducedMotion) {
      element.pause();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !document.hidden) {
          void element.play().catch(() => {});
        } else {
          element.pause();
        }
      },
      { threshold: 0.1 },
    );
    const onVisibilityChange = () => {
      if (document.hidden) element.pause();
      else if (element.getBoundingClientRect().bottom > 0)
        void element.play().catch(() => {});
    };
    observer.observe(element);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [paused, reducedMotion]);

  return (
    <section
      id="home"
      className="stride-hero star-hero"
      aria-labelledby="hero-title"
    >
      <video
        ref={video}
        className="star-hero-video"
        autoPlay={!reducedMotion}
        loop
        muted
        playsInline
        preload="metadata"
        poster="/media/star-man/star-man-desktop.webp"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source
          src="/media/star-man/star-man-mobile.mp4"
          media="(max-width: 700px)"
          type="video/mp4"
        />
        <source src="/media/star-man/star-man-desktop.mp4" type="video/mp4" />
      </video>
      <div className="star-hero-shade" aria-hidden="true" />
      <div className="star-hero-copy">
        <p className="star-hero-eyebrow">СТРАЙД · КЛУБ ДВИЖЕНИЯ</p>
        <h1 id="hero-title">
          <span>Движение, которое</span>
          <em>остаётся с вами.</em>
        </h1>
        <p className="star-hero-lead">
          Найдите свой ритм. Откройте силу, баланс и свободу движения.
        </p>
        <div className="star-hero-actions">
          <Link href="#timetable" className="star-hero-primary">
            Выбрать тренировку <span aria-hidden="true">↗</span>
          </Link>
          <Link href="#club" className="star-hero-secondary">
            Узнать о клубе
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="star-hero-pause"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? "Продолжить видео" : "Приостановить видео"}
        aria-pressed={paused}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
    </section>
  );
}
