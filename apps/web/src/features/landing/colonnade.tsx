"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { PublicItem } from "./types";
import { workoutPhoto } from "./media";
// GetLayers Colonnade's expanding column rhythm, sized within a single viewport.
export function Colonnade({ items }: { items: PublicItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  return (
    <Tabs value={active} onValueChange={setActive} className="photo-colonnade">
      <TabsList className="direction-tabs" aria-label="Направления тренировок">
        {items.map((item, i) => (
          <TabsTrigger key={item.id} value={item.id}>
            <span>0{i + 1}</span>
            {item.name}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="direction-stage">
        {items.map((item) => (
          <TabsContent
            key={item.id}
            value={item.id}
            className="direction-photo-panel"
          >
            <img
              src={item.imageUrl || workoutPhoto(item.name)}
              alt={item.name + " — тренировка в клубе"}
              loading="lazy"
              width={1200}
              height={1600}
            />
            <div className="direction-description">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <Button asChild variant="secondary">
                <Link href={"/workouts/" + item.slug}>О направлении</Link>
              </Button>
            </div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
