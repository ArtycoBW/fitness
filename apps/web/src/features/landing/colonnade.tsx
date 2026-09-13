"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicItem } from "./types";
// Adapted from GetLayers Colonnade. The exit-up / silent-reset conveyor is preserved.
export function Colonnade({ items }: { items: PublicItem[] }) {
  const root = useRef<HTMLDivElement>(null),
    [active, setActive] = useState(0);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const layers = Array.from(
      node.querySelectorAll<HTMLElement>(".column-media,.column-head"),
    );
    const reset = (event: TransitionEvent) => {
      const el = event.target as HTMLElement;
      if (
        event.propertyName !== "transform" ||
        !el.classList.contains("is-out")
      )
        return;
      el.style.transition = "none";
      el.classList.remove("is-out");
      void el.offsetWidth;
      el.style.transition = "";
    };
    layers.forEach((el) => el.addEventListener("transitionend", reset));
    return () =>
      layers.forEach((el) => el.removeEventListener("transitionend", reset));
  }, []);
  useEffect(() => {
    root.current
      ?.querySelectorAll<HTMLElement>(".column-media,.column-head")
      .forEach((el) => {
        if (Number(el.dataset.index) === active) {
          if (el.classList.contains("is-out")) {
            el.style.transition = "none";
            el.classList.remove("is-out");
            void el.offsetWidth;
            el.style.transition = "";
          }
          el.classList.add("is-in");
        } else if (el.classList.contains("is-in")) {
          el.classList.remove("is-in");
          el.classList.add("is-out");
        }
      });
  }, [active]);
  return (
    <div ref={root} className="colonnade">
      <div
        className="column-strip"
        role="tablist"
        aria-label="Направления тренировок"
      >
        {items.map((item, i) => (
          <button
            id={`direction-${i}`}
            aria-controls={`direction-panel-${i}`}
            role="tab"
            type="button"
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            key={item.id}
            className={"direction-column " + (i === active ? "is-active" : "")}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setActive(i);
            }}
            onKeyDown={(e) => {
              if (
                [
                  "ArrowRight",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowUp",
                  "Home",
                  "End",
                ].includes(e.key)
              ) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? items.length - 1
                      : (i +
                          (e.key === "ArrowRight" || e.key === "ArrowDown"
                            ? 1
                            : -1) +
                          items.length) %
                        items.length;
                setActive(next);
                const tabs =
                  root.current?.querySelectorAll<HTMLButtonElement>(
                    "[role=tab]",
                  );
                tabs?.item(next)?.focus();
              }
            }}
          >
            <span
              className="column-media"
              data-index={i}
              style={{
                backgroundColor: [
                  "#cfe7d3",
                  "#b6ced5",
                  "#e1f4df",
                  "#b1dbb8",
                  "#dce5d0",
                ][i % 5],
              }}
            >
              <svg
                viewBox="0 0 320 600"
                aria-hidden="true"
                className="botanical-drawing"
              >
                <g fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M150 580 Q230 410 154 150 Q130 80 190 15" />
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <path
                      key={n}
                      d={`M${165 + (n % 2) * 13} ${150 + n * 65} q ${n % 2 ? -110 : 100} -100 ${n % 2 ? -90 : 105} -135 q ${n % 2 ? 115 : -105} 10 ${n % 2 ? 90 : -105} 135`}
                    />
                  ))}
                </g>
              </svg>
            </span>
            <span className="column-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="column-name">{item.name}</span>
          </button>
        ))}
      </div>
      <div className="column-headline">
        {items.map((item, i) => (
          <div
            id={`direction-panel-${i}`}
            role="tabpanel"
            aria-labelledby={`direction-${i}`}
            aria-hidden={active !== i}
            inert={active !== i}
            className="column-head"
            data-index={i}
            key={item.id}
          >
            <span className="eyebrow">
              {item.durationMinutes} МИНУТ ДЛЯ СЕБЯ
            </span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <Link href={"/workouts/" + item.slug} className="landing-button">
              О направлении <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
