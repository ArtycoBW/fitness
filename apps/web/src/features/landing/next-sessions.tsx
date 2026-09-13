"use client";
import { Button } from "@/components/ui/button";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { dateOnly } from "@/lib/format";
import {
  type Session,
  localDay,
  addDays,
  time,
} from "@/features/schedule/types";
export function NextSessions() {
  const today = localDay(),
    q = useQuery({
      queryKey: ["landing-schedule", today],
      queryFn: () =>
        api<Session[]>(
          `/public/schedule?from=${today}&to=${addDays(today, 6)}`,
        ),
      refetchInterval: 15000,
    });
  const items = q.data
    ?.filter(
      (s) =>
        new Date(s.startAt).getTime() > Date.now() && s.status !== "CANCELLED",
    )
    .slice(0, 4);
  return (
    <div className="landing-sessions">
      {q.error ? (
        <p>
          Расписание временно недоступно.{" "}
          <Button
            variant="ghost"
            type="button"
            onClick={() => void q.refetch()}
          >
            Обновить
          </Button>
        </p>
      ) : !q.data ? (
        <p role="status">Загружаем ближайшие занятия…</p>
      ) : items?.length ? (
        items.map((s) => (
          <Link
            className="landing-session"
            href={`/schedule?date=${localDay(new Date(s.startAt))}&view=day&session=${s.id}`}
            key={s.id}
          >
            <time>
              <strong>{time(s.startAt)}</strong>
              <span>{dateOnly(s.startAt)}</span>
            </time>
            <div>
              <h3>{s.workout.name}</h3>
              <p>
                {s.trainer.user.name} · {s.hall.name}
              </p>
            </div>
            <span className="session-place">
              {s.freePlaces ? `${s.freePlaces} мест` : "Очередь"}
            </span>
            <span className="round-link" aria-hidden="true">
              {" "}
            </span>
          </Link>
        ))
      ) : (
        <p>
          Скоро здесь появятся новые занятия.{" "}
          <Link href="/schedule">Посмотреть календарь </Link>
        </p>
      )}
    </div>
  );
}
