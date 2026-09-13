"use client";

import { SelectField } from "@/components/ui/select-field";
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
import { BookingPicker } from "@/features/bookings/booking-picker";
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
  const [cancelImpact, setCancelImpact] = useState<{
    body: unknown;
    count: number;
    bookings: { id: string; client: { name: string } }[];
  } | null>(null);
  const checkCancel = useMutation({
    mutationFn: async (body: unknown) => ({
      body,
      ...(await post<{
        count: number;
        bookings: { id: string; client: { name: string } }[];
      }>("/schedule/" + selected + "/cancel-preview", body)),
    }),
    onSuccess: setCancelImpact,
  });
  const filters = {
    from: days[0]!,
    to: days[days.length - 1]!,
    ...(params.get("trainerId") ? { trainerId: params.get("trainerId")! } : {}),
    ...(params.get("hallId") ? { hallId: params.get("hallId")! } : {}),
    ...(params.get("workoutId") ? { workoutId: params.get("workoutId")! } : {}),
    ...(params.get("level") ? { level: params.get("level")! } : {}),
    ...(params.get("available") ? { available: params.get("available")! } : {}),
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
    refetchInterval: 10000,
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
    refetchInterval: 10000,
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
  const open = (s: Session) => {
    setCancelling(false);
    setCancelImpact(null);
    set("session", s.id);
  };
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
          <Button
            variant="ghost"
            className={view === "week" ? "is-active" : ""}
            onClick={() => set("view", "week")}
          >
            Неделя
          </Button>
          <Button
            variant="ghost"
            className={view === "day" ? "is-active" : ""}
            onClick={() => set("view", "day")}
          >
            День
          </Button>
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
            <SelectField
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
            </SelectField>
          ))}
        <SelectField
          aria-label="Уровень подготовки"
          className="form-select"
          value={params.get("level") ?? ""}
          onChange={(e) => set("level", e.target.value)}
        >
          <option value="">Любой уровень</option>
          <option value="ALL">Для всех</option>
          <option value="BEGINNER">Начальный</option>
          <option value="INTERMEDIATE">Средний</option>
          <option value="ADVANCED">Продвинутый</option>
        </SelectField>
        <label className="inline-check">
          <Input
            type="checkbox"
            checked={params.get("available") === "true"}
            onChange={(e) => set("available", e.target.checked ? "true" : "")}
          />
          Есть места
        </label>
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
                      <Button
                        variant="ghost"
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
                      </Button>
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
        <DialogContent className="session-dialog">
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
              ) : null}
              {area !== "public" && (
                <Button variant="outline" asChild>
                  <Link
                    href={
                      "/" +
                      area +
                      "/bookings?sessionId=" +
                      session.id +
                      "&upcoming=false"
                    }
                  >
                    Участники занятия
                  </Link>
                </Button>
              )}
              {session.status === "PUBLISHED" &&
                area !== "trainer" &&
                !cancelling && (
                  <BookingPicker key={session.id} session={session} />
                )}
              {cancelling && (
                <form
                  className="form-stack"
                  onChange={() => setCancelImpact(null)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    checkCancel.mutate({
                      version: session.version,
                      scope: f.get("scope"),
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <Label htmlFor="scope">Отменить</Label>
                  <SelectField className="form-select" id="scope" name="scope">
                    <option value="ONE">Только это занятие</option>
                    {session.seriesId && (
                      <option value="FUTURE">
                        Это и будущие занятия серии
                      </option>
                    )}
                  </SelectField>
                  <Label htmlFor="reason">Причина отмены</Label>
                  <Input id="reason" name="reason" required minLength={3} />
                  {(cancel.error || checkCancel.error) && (
                    <p className="form-error">
                      {cancel.error?.message ?? checkCancel.error?.message}
                    </p>
                  )}
                  {cancelImpact && (
                    <div className="notice">
                      <p>
                        Занятий к отмене: {cancelImpact.count}. Посещения
                        вернутся в остаток.
                      </p>
                      <ul className="impact-list">
                        {cancelImpact.bookings.map((b) => (
                          <li key={b.id}>{b.client.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="button-row">
                    <Button variant="outline" disabled={checkCancel.isPending}>
                      Проверить последствия
                    </Button>
                    <Button
                      type="button"
                      disabled={!cancelImpact || cancel.isPending}
                      onClick={() => cancel.mutate(cancelImpact?.body)}
                    >
                      Подтвердить отмену
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
