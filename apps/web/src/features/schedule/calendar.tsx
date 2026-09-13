"use client";
import { Button } from "@/components/ui/button";

import { type Session, minutes, time, localDay } from "./types";
export function Calendar({
  days,
  sessions,
  onOpen,
  onMove,
  editable,
}: {
  days: string[];
  sessions: Session[];
  onOpen: (s: Session) => void;
  onMove: (s: Session, startAt: string, endAt: string) => void;
  editable: boolean;
}) {
  const firstHour = Math.min(
      7,
      ...sessions.map((s) => Math.floor(minutes(s.startAt) / 60)),
    ),
    lastHour = Math.max(
      22,
      ...sessions.map((s) => Math.ceil((minutes(s.endAt) || 1440) / 60)),
    ),
    height = (lastHour - firstHour) * 72;
  return (
    <div className="calendar-wrap">
      <div
        className="calendar-grid"
        style={{
          gridTemplateColumns:
            "56px repeat(" + days.length + ",minmax(120px,1fr))",
        }}
      >
        <div className="calendar-corner">МСК</div>
        {days.map((day) => (
          <div
            className={"calendar-day " + (day === localDay() ? "is-today" : "")}
            key={day}
          >
            <span>
              {new Date(day + "T12:00Z").toLocaleDateString("ru-RU", {
                weekday: "short",
              })}
            </span>
            <strong>{Number(day.slice(-2))}</strong>
          </div>
        ))}
        <div className="calendar-times" style={{ height }}>
          {Array.from({ length: lastHour - firstHour }, (_, i) => (
            <span style={{ top: i * 72 }} key={i}>
              {String(firstHour + i).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((day) => {
          const events = sessions
            .filter((s) => localDay(new Date(s.startAt)) === day)
            .sort((a, b) => a.startAt.localeCompare(b.startAt));
          let laneEnds: number[] = [],
            cluster = { lanes: 0 },
            clusterEnd = 0;
          const placements = events.map((s) => {
            const start = minutes(s.startAt);
            if (start >= clusterEnd) {
              laneEnds = [];
              cluster = { lanes: 0 };
            }
            let lane = laneEnds.findIndex((end) => end <= start);
            if (lane < 0) lane = laneEnds.length;
            laneEnds[lane] = minutes(s.endAt) || 1440;
            clusterEnd = Math.max(
              start >= clusterEnd ? 0 : clusterEnd,
              laneEnds[lane]!,
            );
            cluster.lanes = laneEnds.length;
            return { s, lane, cluster };
          });
          return (
            <div
              className="calendar-column"
              key={day}
              style={{ height }}
              onDragOver={(e) => editable && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!editable) return;
                const s = sessions.find(
                  (s) =>
                    s.id ===
                    e.dataTransfer.getData("application/fitness-session"),
                );
                if (!s) return;
                const top = e.currentTarget.getBoundingClientRect().top;
                const minute = Math.max(
                  0,
                  Math.min(
                    1425,
                    Math.round(
                      (firstHour * 60 + (e.clientY - top) / 1.2) / 15,
                    ) * 15,
                  ),
                );
                const startAt = new Date(
                  day +
                    "T" +
                    String(Math.floor(minute / 60)).padStart(2, "0") +
                    ":" +
                    String(minute % 60).padStart(2, "0") +
                    ":00+03:00",
                ).toISOString();
                onMove(
                  s,
                  startAt,
                  new Date(
                    new Date(startAt).getTime() +
                      new Date(s.endAt).getTime() -
                      new Date(s.startAt).getTime(),
                  ).toISOString(),
                );
              }}
            >
              {placements.map(({ s, lane, cluster }) => (
                <Button
                  variant="ghost"
                  key={s.id}
                  className={"calendar-event event-" + s.status.toLowerCase()}
                  style={{
                    top: (minutes(s.startAt) - firstHour * 60) * 1.2,
                    height: Math.max(
                      32,
                      ((new Date(s.endAt).getTime() -
                        new Date(s.startAt).getTime()) /
                        60000) *
                        1.2 -
                        4,
                    ),
                    left: "calc(" + (lane * 100) / cluster.lanes + "% + 3px)",
                    width: "calc(" + 100 / cluster.lanes + "% - 6px)",
                  }}
                  draggable={
                    editable &&
                    new Date(s.startAt) > new Date() &&
                    s.status !== "CANCELLED"
                  }
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/fitness-session", s.id)
                  }
                  onClick={() => onOpen(s)}
                  title={
                    s.workout.name +
                    " · " +
                    time(s.startAt) +
                    " · " +
                    s.trainer.user.name
                  }
                >
                  <small>{time(s.startAt)}</small>
                  <strong>{s.workout.name}</strong>
                  <span>{s.trainer.user.name}</span>
                  <span>
                    {s.hall.name} · {s.freePlaces} мест
                  </span>
                </Button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
