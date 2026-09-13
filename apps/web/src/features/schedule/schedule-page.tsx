"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Users,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { api, post, type User } from "@/lib/api";
import { dateOnly } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "./calendar";
import { SessionEditor } from "./session-editor";
import {
  type Session,
  statusNames,
  localDay,
  monday,
  addDays,
  time,
} from "./types";
export function SchedulePage({
  area,
}: {
  area: "admin" | "trainer" | "public";
}) {
  const qc = useQueryClient(),
    user = qc.getQueryData<User>(["me"]);
  const editable =
    area === "admin" &&
    !!user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const { params, set } = useUrlState(),
    date = params.get("date") ?? localDay(),
    view = params.get("view") ?? "week",
    start = view === "day" ? date : monday(date),
    days = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) =>
      addDays(start, i),
    ),
    selected = params.get("session") ?? "";
  const [editing, setEditing] = useState<{
      session?: Session;
      proposal?: { startAt: string; endAt: string };
    } | null>(null),
    [cancelling, setCancelling] = useState(false);
  const filters = {
    from: days[0]!,
    to: days[days.length - 1]!,
    ...(params.get("trainerId") ? { trainerId: params.get("trainerId")! } : {}),
    ...(params.get("hallId") ? { hallId: params.get("hallId")! } : {}),
    ...(params.get("workoutId") ? { workoutId: params.get("workoutId")! } : {}),
  };
  const {
    data: sessions,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["schedule", area, filters],
    queryFn: ({ signal }) =>
      api<Session[]>(
        (area === "public" ? "/public" : "") +
          "/schedule?" +
          new URLSearchParams(filters),
        { signal },
      ),
    refetchInterval: 30000,
  });
  const { data: resources } = useQuery({
    queryKey: ["schedule-filter-resources"],
    queryFn: async () => {
      const kinds = ["workouts", "trainers", "halls"];
      const lists = await Promise.all(
        kinds.map((k) =>
          api<Array<{ id: string; name: string }>>("/public/" + k),
        ),
      );
      return Object.fromEntries(kinds.map((k, i) => [k, lists[i] ?? []]));
    },
  });
  const { data: session, error: detailError } = useQuery({
    queryKey: ["schedule", "detail", area, selected],
    queryFn: () =>
      api<Session>(
        (area === "public" ? "/public" : "") + "/schedule/" + selected,
      ),
    enabled: !!selected,
  });
  const cancel = useMutation({
    mutationFn: (body: unknown) =>
      post("/schedule/" + selected + "/cancel", body, crypto.randomUUID()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      setCancelling(false);
      set("session", "");
      toast.success("Занятие отменено");
    },
  });
  const open = (s: Session) => set("session", s.id);
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">
            {area === "public" ? "ВЫБЕРИТЕ СВОЙ РИТМ" : "ПЛАН КЛУБА"}
          </span>
          <h1>
            {area === "trainer" ? "Моё расписание" : "Расписание занятий"}
          </h1>
          <p>
            {area === "public"
              ? "Найдите время для движения. Все занятия — по московскому времени."
              : "Занятия, люди и пространства. Время по Москве."}
          </p>
        </div>
        {editable && (
          <Button onClick={() => setEditing({})}>
            <Plus size={18} />
            Добавить занятие
          </Button>
        )}
      </div>
      <div className="schedule-toolbar">
        <div className="button-row">
          <Button
            variant="outline"
            aria-label="Предыдущий период"
            onClick={() => set("date", addDays(date, view === "day" ? -1 : -7))}
          >
            <ChevronLeft size={17} />
          </Button>
          <Button variant="outline" onClick={() => set("date", localDay())}>
            Сегодня
          </Button>
          <Button
            variant="outline"
            aria-label="Следующий период"
            onClick={() => set("date", addDays(date, view === "day" ? 1 : 7))}
          >
            <ChevronRight size={17} />
          </Button>
          <Input
            aria-label="Дата расписания"
            className="date-input"
            type="date"
            value={date}
            onChange={(e) => e.target.value && set("date", e.target.value)}
          />
        </div>
        <div className="segmented">
          <button
            className={view === "week" ? "is-active" : ""}
            onClick={() => set("view", "week")}
          >
            Неделя
          </button>
          <button
            className={view === "day" ? "is-active" : ""}
            onClick={() => set("view", "day")}
          >
            День
          </button>
        </div>
      </div>
      <div className="schedule-filters">
        {[
          ["workouts", "workoutId", "Все направления"],
          ["trainers", "trainerId", "Все тренеры"],
          ["halls", "hallId", "Все залы"],
        ]
          .filter(([, name]) => area !== "trainer" || name !== "trainerId")
          .map(([kind, name, label]) => (
            <select
              className="form-select"
              key={name}
              aria-label={label}
              value={params.get(name!) ?? ""}
              onChange={(e) => set(name!, e.target.value)}
            >
              <option value="">{label}</option>
              {resources?.[kind!]?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ))}
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      ) : !sessions ? (
        <div className="table-status" role="status">
          Загружаем расписание…
        </div>
      ) : (
        <>
          <div className="calendar-desktop" aria-busy={isFetching}>
            <Calendar
              days={days}
              sessions={sessions}
              onOpen={open}
              editable={editable}
              onMove={(s, startAt, endAt) =>
                setEditing({ session: s, proposal: { startAt, endAt } })
              }
            />
          </div>
          <div className="schedule-agenda">
            {sessions.length === 0 && (
              <div className="empty-state">
                <h2>В этот период занятий нет</h2>
                <p>Выберите другие даты или измените фильтры.</p>
              </div>
            )}
            {days.map((day) => {
              const rows = sessions.filter(
                (s) => localDay(new Date(s.startAt)) === day,
              );
              if (!rows.length) return null;
              return (
                <section key={day}>
                  <h2>{dateOnly(day + "T12:00:00Z")}</h2>
                  {rows.length ? (
                    rows.map((s) => (
                      <button
                        className="agenda-row"
                        key={s.id}
                        onClick={() => open(s)}
                      >
                        <span className="agenda-time">
                          {time(s.startAt)}
                          <small>{time(s.endAt)}</small>
                        </span>
                        <span>
                          <strong>{s.workout.name}</strong>
                          <small>
                            {s.trainer.user.name} · {s.hall.name}
                          </small>
                          <span className="status-pill">
                            {s.status === "PUBLISHED"
                              ? s.freePlaces + " мест"
                              : statusNames[s.status]}
                          </span>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <p className="muted">Занятий нет</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
      {editing && (
        <SessionEditor {...editing} onClose={() => setEditing(null)} />
      )}
      <Dialog open={!!selected} onOpenChange={(o) => !o && set("session", "")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{session?.workout.name ?? "Занятие"}</DialogTitle>
            <DialogDescription>
              {session ? dateOnly(session.startAt) : "Загрузка подробностей"}
            </DialogDescription>
          </DialogHeader>
          {detailError && <p className="form-error">{detailError.message}</p>}
          {session && (
            <>
              <span className="status-pill">{statusNames[session.status]}</span>
              <p className="muted">{session.workout.description}</p>
              <div className="session-facts">
                <p>
                  <Clock3 size={17} />
                  {time(session.startAt)} — {time(session.endAt)}
                </p>
                <p>
                  <MapPin size={17} />
                  {session.hall.name}
                </p>
                <p>
                  <Users size={17} />
                  {session.trainer.user.name}
                </p>
                <p>
                  Свободно {session.freePlaces} из {session.capacity} мест
                </p>
              </div>
              {session.status === "PUBLISHED" && (
                <p className="field-hint">
                  Отмена без списания посещения — не позднее чем за{" "}
                  {session.policySnapshot.cancelMinutes / 60} ч до начала.
                </p>
              )}
              {session.status === "CANCELLED" && (
                <p className="form-error">{session.cancelledReason}</p>
              )}
              {editable &&
              new Date(session.startAt) > new Date() &&
              session.status !== "CANCELLED" ? (
                <div className="button-row">
                  <Button
                    onClick={() => {
                      set("session", "");
                      setEditing({ session });
                    }}
                  >
                    <Pencil size={16} />
                    Изменить
                  </Button>
                  <Button variant="outline" onClick={() => setCancelling(true)}>
                    Отменить занятие
                  </Button>
                </div>
              ) : area === "public" && session.status === "PUBLISHED" ? (
                <Button asChild>
                  <Link
                    href={
                      "/login?next=" +
                      encodeURIComponent("/schedule?session=" + session.id)
                    }
                  >
                    Перейти к записи
                  </Link>
                </Button>
              ) : null}
              {cancelling && (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    cancel.mutate({
                      version: session.version,
                      scope: f.get("scope"),
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <Label htmlFor="scope">Отменить</Label>
                  <select className="form-select" id="scope" name="scope">
                    <option value="ONE">Только это занятие</option>
                    {session.seriesId && (
                      <option value="FUTURE">
                        Это и будущие занятия серии
                      </option>
                    )}
                  </select>
                  <Label htmlFor="reason">Причина отмены</Label>
                  <Input id="reason" name="reason" required minLength={3} />
                  {cancel.error && (
                    <p className="form-error">{cancel.error.message}</p>
                  )}
                  <Button disabled={cancel.isPending}>
                    Подтвердить отмену
                  </Button>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
