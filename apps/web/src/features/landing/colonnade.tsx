"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicItem } from "./types";
import { workoutPhoto } from "./media";

// Adapted from the supplied GetLayers Colonnade: expanding columns and an
// upward conveyor, with the outgoing layer reset below after its exit.
export function Colonnade({ items }: { items: PublicItem[] }) {
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const select = (index: number, focus = false) => {
    if (index !== active) {
      setLeaving(active);
      setActive(index);
    }
    if (focus) tabs.current[index]?.focus();
  };
  if (!items.length) return null;
  return (
    <div className="colonnade" role="group" aria-label="Направления тренировок">
      {items.map((item, index) => (
        <article
          className="colonnade-column"
          data-active={active === index}
          key={item.id}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") select(index);
          }}
        >
          <div
            className="colonnade-media"
            data-phase={
              active === index ? "in" : leaving === index ? "out" : "rest"
            }
            onAnimationEnd={() => {
              if (leaving === index) setLeaving(null);
            }}
            aria-hidden="true"
          >
            <img
              src={item.imageUrl || workoutPhoto(item.name)}
              alt=""
              loading="lazy"
              width={1200}
              height={1600}
            />
          </div>
          <button
            className="colonnade-trigger"
            ref={(node) => {
              tabs.current[index] = node;
            }}
            aria-expanded={active === index}
            aria-controls={`${id}-${index}`}
            aria-label={item.name}
            onFocus={() => select(index)}
            onClick={() => select(index)}
            onKeyDown={(event) => {
              const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
                ? 1
                : ["ArrowLeft", "ArrowUp"].includes(event.key)
                  ? -1
                  : 0;
              if (delta || event.key === "Home" || event.key === "End") {
                event.preventDefault();
                select(
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index + delta + items.length) % items.length,
                  true,
                );
              }
            }}
          >
            <span className="colonnade-number">
              {String(index + 1).padStart(2, "0")}{" "}
              <ArrowUpRight size={18} aria-hidden="true" />
            </span>
            <span className="colonnade-name">
              {item.name
                .replace("Мобильность", "Мобиль\u00adность")
                .replace("Функциональный", "Функцио\u00adнальный")}
            </span>
          </button>
          <div
            className="colonnade-description"
            id={`${id}-${index}`}
            inert={active !== index}
            aria-hidden={active !== index}
          >
            <p>{item.description}</p>
            <Button asChild variant="secondary">
              <Link href={"/workouts/" + item.slug}>
                О направлении <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
