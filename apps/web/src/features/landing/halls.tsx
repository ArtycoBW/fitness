"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicItem } from "./types";
import type { mountHallScene } from "./hall-scene";
export function Halls({ items }: { items: PublicItem[] }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<ReturnType<typeof mountHallScene> | null>(null),
    [active, setActive] = useState(0),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !items.length) return;
    let disposed = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        void import("./hall-scene")
          .then(({ mountHallScene }) => {
            if (disposed) return;
            try {
              scene.current = mountHallScene(node, items, () => setReady(true));
            } catch {
              setFailed(true);
            }
          })
          .catch(() => setFailed(true));
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    const lost = (e: Event) => {
      e.preventDefault();
      if (!disposed) {
        setFailed(true);
        setReady(false);
      }
    };
    node.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      io.disconnect();
      node.removeEventListener("webglcontextlost", lost);
      scene.current?.dispose();
      scene.current = null;
    };
  }, [items]);
  useEffect(() => {
    scene.current?.select(active);
  }, [active, ready]);
  const item = items[active];
  if (!item) return <p>Залы скоро появятся здесь.</p>;
  return (
    <div className="hall-experience">
      <div className="hall-canvas-wrap">
        <svg
          className="hall-fallback"
          viewBox="0 0 650 450"
          aria-label="Схема зала"
          role="img"
        >
          <g transform="translate(330 190) rotate(-30) skewX(30)">
            <rect
              x="-170"
              y="-110"
              width="340"
              height="230"
              rx="5"
              fill="#d4c5a8"
              stroke="#0f3e17"
            />
            {[-105, 30].flatMap((x) =>
              [-65, 30].map((y) => (
                <rect
                  key={x + ":" + y}
                  x={x}
                  y={y}
                  width="72"
                  height="55"
                  rx="6"
                  fill="#b1dbb8"
                  stroke="#0f3e17"
                />
              )),
            )}
            <path
              d="M-170 120V-110H170"
              fill="none"
              stroke="#fffefc"
              strokeWidth="14"
            />
          </g>
          <text
            x="325"
            y="380"
            textAnchor="middle"
            fill="#0f3e17"
            fontSize="19"
          >
            {item.name}
          </text>
        </svg>
        <canvas
          ref={canvas}
          aria-hidden="true"
          style={{ opacity: ready && !failed ? 1 : 0 }}
        />
        <span className="hall-caption">
          ПРОСТРАНСТВО ДЛЯ ДВИЖЕНИЯ · {String(active + 1).padStart(2, "0")}
        </span>
      </div>
      <div className="hall-details">
        <div className="hall-tabs" role="group" aria-label="Выбор зала">
          {items.map((h, i) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              {String(i + 1).padStart(2, "0")}. {h.name}
            </button>
          ))}
        </div>
        <div aria-live="polite">
          <h3>{item.name}</h3>
          <p>{item.description}</p>
          <dl>
            <div>
              <dt>Вместимость</dt>
              <dd>До {item.capacity} человек</dd>
            </div>
            <div>
              <dt>Оборудование</dt>
              <dd>{item.equipment?.join(", ")}</dd>
            </div>
          </dl>
        </div>
        <Link className="landing-button" href={"/schedule?hallId=" + item.id}>
          Расписание зала <span>↗</span>
        </Link>
        <Link className="table-link mt-5" href={"/halls/" + item.slug}>
          Подробнее о пространстве →
        </Link>
      </div>
    </div>
  );
}
