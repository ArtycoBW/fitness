"use client";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicItem } from "./types";
import type { mountHallScene } from "./hall-world";
import { workoutPhoto } from "./media";
export function Halls({ items }: { items: PublicItem[] }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<ReturnType<typeof mountHallScene> | null>(null),
    [active, setActive] = useState(0),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !items.length) return;
    let disposed = false,
      inView = false,
      started = false;
    let timer: ReturnType<typeof setTimeout>;
    const prepare = () => {
      clearTimeout(timer);
      if (!inView || started) return;
      timer = setTimeout(() => {
        if (disposed || !inView) return;
        started = true;
        io.disconnect();
        window.removeEventListener("scroll", prepare);
        void import("./hall-world")
          .then(({ mountHallScene }) => {
            if (disposed) return;
            try {
              scene.current = mountHallScene(node, items, () => setReady(true));
            } catch {
              setFailed(true);
            }
          })
          .catch(() => {
            if (!disposed) setFailed(true);
          });
      }, 280);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = !!entry?.isIntersecting;
        prepare();
      },
      { threshold: 0.15 },
    );
    io.observe(node);
    window.addEventListener("scroll", prepare, { passive: true });
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
      clearTimeout(timer);
      window.removeEventListener("scroll", prepare);
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
  if (!item) return <p>Информация о пространствах временно недоступна.</p>;
  return (
    <div className="hall-experience">
      <div className="hall-canvas-wrap">
        <img
          className="hall-fallback"
          src={workoutPhoto(
            /сил/i.test(item.name)
              ? "Силовая тренировка"
              : /персон/i.test(item.name)
                ? "Пилатес"
                : "Йога",
          )}
          alt={item.name}
        />
        <canvas
          ref={canvas}
          role="img"
          aria-label={
            "Интерактивный интерьер: " +
            item.name +
            ". Перетаскивайте для обзора или используйте кнопки управления."
          }
          style={{ opacity: ready && !failed ? 1 : 0 }}
        />
        {ready && !failed && (
          <div className="hall-view-controls" aria-label="Управление обзором">
            <span>Осмотритесь внутри</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Повернуть влево"
              onClick={() => scene.current?.turn(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Повернуть вправо"
              onClick={() => scene.current?.turn(1)}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Приблизить интерьер"
              onClick={() => scene.current?.zoom(-6)}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Отдалить интерьер"
              onClick={() => scene.current?.zoom(6)}
            >
              <Minus />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Исходный ракурс"
              onClick={() => scene.current?.reset()}
            >
              <RotateCcw />
            </Button>
          </div>
        )}
      </div>
      <div className="hall-details">
        <div className="hall-tabs" role="group" aria-label="Выбор зала">
          {items.map((h, i) => (
            <Button
              variant="ghost"
              key={h.id}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              {String(i + 1).padStart(2, "0")}. {h.name}
            </Button>
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
        <div className="hall-actions">
          <Button asChild size="lg">
            <Link href={"/schedule?hallId=" + item.id}>Расписание зала</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={"/halls/" + item.slug}>Подробнее о пространстве</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
