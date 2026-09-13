"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editorialPhotos } from "@/features/landing/media";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
export function AuthArtCarousel() {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (paused || reduced) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % editorialPhotos.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [paused, reduced]);
  return (
    <>
      <div className="auth-slides" aria-hidden="true">
        {editorialPhotos.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className={index === i ? "is-current" : ""}
            loading={i === 0 ? "eager" : "lazy"}
            width={1200}
            height={1600}
          />
        ))}
      </div>
      <div className="auth-slide-controls">
        <div className="auth-slide-dots">
          {editorialPhotos.map((_, i) => (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              aria-label={`Фотография ${i + 1}`}
              aria-pressed={index === i}
              onClick={() => {
                setIndex(i);
                setPaused(true);
              }}
            >
              <span />
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPaused(!paused)}
          aria-label={
            paused
              ? "Продолжить смену фотографий"
              : "Приостановить смену фотографий"
          }
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </Button>
      </div>
    </>
  );
}
