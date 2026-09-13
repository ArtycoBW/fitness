"use client";

import Link from "next/link";
import type { PublicItem } from "./types";
import { trainerPhoto } from "./media";
export function Almanac({ items }: { items: PublicItem[] }) {
  return (
    <div className="trainer-gallery">
      {items.map((t) => (
        <article className="trainer-editorial" key={t.id} data-reveal>
          <Link
            href={"/trainers/" + t.slug}
            aria-label={"Подробнее: " + t.name}
          >
            <div className="trainer-image">
              <img
                src={t.avatarUrl || trainerPhoto(t.name)}
                alt={t.name}
                loading="lazy"
                width={1200}
                height={1600}
              />
            </div>
            <div className="trainer-caption">
              <h3>{t.name}</h3>
              <p>{t.specialties?.join(" · ")}</p>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
