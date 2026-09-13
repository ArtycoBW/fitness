"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import InfiniteGallery from "@/components/ui/3d-gallery-photography";
import type { PublicItem } from "./types";
import { workoutPhoto } from "./media";
export function Colonnade({ items }: { items: PublicItem[] }) {
  const [active, setActive] = useState(0);
  const images = useMemo(
    () =>
      items.map((item) => ({
        src: item.imageUrl || workoutPhoto(item.name),
        alt: item.name + " — тренировка в клубе",
      })),
    [items],
  );
  if (!items.length) return null;
  return (
    <div className="directions-gallery">
      <InfiniteGallery images={images} active={active} onActive={setActive} />
      <div className="gallery-copy">
        {items.map((item, i) => (
          <div
            className="gallery-description"
            key={item.id}
            data-active={active === i}
            inert={active !== i}
            aria-hidden={active !== i}
          >
            <span className="eyebrow">ВАШЕ ДВИЖЕНИЕ / 0{i + 1}</span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <Button asChild>
              <Link href={"/workouts/" + item.slug}>О направлении</Link>
            </Button>
          </div>
        ))}
      </div>
      <div
        className="gallery-directions"
        role="group"
        aria-label="Направления тренировок"
      >
        {items.map((item, i) => (
          <Button
            key={item.id}
            variant="ghost"
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            {item.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
