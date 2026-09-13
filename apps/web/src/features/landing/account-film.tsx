"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
export function AccountFilm() {
  const video = useRef<HTMLVideoElement>(null),
    [paused, setPaused] = useState(false),
    [near, setNear] = useState(false),
    reduced = usePrefersReducedMotion();
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let inView = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = !!entry?.isIntersecting;
        inView = visible;
        if (visible) setNear(true);
        if (visible && !paused && !reduced && !document.hidden)
          void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    const visibility = () => {
      if (document.hidden) el.pause();
      else if (inView && !paused && !reduced) void el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      el.pause();
    };
  }, [paused, reduced, near]);
  return (
    <div className="account-film">
      <video
        ref={video}
        src={near && !reduced ? "/media/account-preview-loop.mp4" : undefined}
        poster="/media/account-preview.webp"
        muted
        loop
        playsInline
        preload="none"
        aria-label="Обзор личного кабинета: занятия, расписание и абонементы"
      />
      <Button
        className="film-pause"
        variant="secondary"
        size="icon"
        aria-label={
          paused
            ? "Продолжить превью кабинета"
            : "Приостановить превью кабинета"
        }
        onClick={() => setPaused(!paused)}
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
      </Button>
    </div>
  );
}
