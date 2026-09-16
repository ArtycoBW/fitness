"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { localDay } from "@/features/schedule/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import styles from "./trainer-hours.module.css";

type WorkSession = {
  id: string;
  trainerId: string;
  trainer: string;
  workout: string;
  hall: string;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  ended: boolean;
  workLog: { minutes: number; note: string; version: number } | null;
};
interface HoursReport {
  trainers: {
    id: string;
    name: string;
    scheduledMinutes: number;
    workedMinutes: number;
    sessions: number;
    pending: number;
  }[];
  days: { date: string; booked: number; capacity: number; sessions: number }[];
  items: WorkSession[];
  summary: {
    sessions: number;
    workedMinutes: number;
    pending: number;
    occupancy: number | null;
  };
}
const duration = (minutes: number) =>
  `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`;
const shortDate = (day: string) =>
  new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(day + "T12:00:00+03:00"));

export function TrainerHours() {
  const today = localDay();
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today);
  const [trainerId, setTrainer] = useState(""),
    [pendingOnly, setPendingOnly] = useState(false),
    [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WorkSession | null>(null);
  const qc = useQueryClient();
  const valid =
    !!from &&
    !!to &&
    to >= from &&
    Date.parse(to) - Date.parse(from) < 92 * 86400000;
  const query = useQuery({
    queryKey: ["trainer-hours", from, to],
    queryFn: () =>
      api<HoursReport>(`/analytics/trainer-hours?from=${from}&to=${to}`),
    enabled: valid,
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const rows =
    data?.items.filter(
      (s) =>
        s.ended &&
        (!trainerId || s.trainerId === trainerId) &&
        (!pendingOnly || !s.workLog),
    ) ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  const maxMinutes = Math.max(
    60,
    ...(data?.trainers.map((t) => t.workedMinutes) ?? []),
  );
  return (
    <div className={styles.page}>
      <div className="page-heading">
        <span className="eyebrow">РАБОТА КЛУБА</span>
        <h1>Загрузка и часы тренеров</h1>
        <p>Расписание, заполняемость занятий и подтверждённое время работы.</p>
      </div>
      <div className={styles.period}>
        <label>
          С{" "}
          <Input
            type="date"
            aria-label="Начало периода"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          По{" "}
          <Input
            type="date"
            aria-label="Конец периода"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <span className="muted">До 92 дней · московское время</span>
        <span className={styles.refresh} role="status">
          {query.isFetching ? "Обновляем…" : ""}
        </span>
      </div>
      {!valid && (
        <p role="alert" className="form-error">
          Выберите период от 1 до 92 дней.
        </p>
      )}
      {query.error && (
        <p role="alert" className="form-error">
          {query.error.message}
        </p>
      )}
      {!data && query.isPending && valid && (
        <p role="status">Загружаем статистику…</p>
      )}
      {data && (
        <div aria-busy={query.isFetching}>
          <div className={styles.metrics}>
            {[
              ["Занятий в расписании", data.summary.sessions],
              ["Подтверждено часов", duration(data.summary.workedMinutes)],
              ["Ожидают подтверждения", data.summary.pending],
              [
                "Заполняемость",
                data.summary.occupancy === null
                  ? "—"
                  : data.summary.occupancy + "%",
              ],
            ].map(([label, value]) => (
              <section key={label} className={styles.metric}>
                <span>{label}</span>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <div className={styles.charts}>
            <section className={styles.card}>
              <h2>Отработанное время</h2>
              <p className="muted">
                Подтверждённые администратором часы за период.
              </p>
              <div
                className={styles.bars}
                role="img"
                aria-label={data.trainers
                  .map((t) => `${t.name}: ${duration(t.workedMinutes)}`)
                  .join("; ")}
              >
                {data.trainers.map((t) => (
                  <div key={t.id} className={styles.barRow}>
                    <div>
                      <span>{t.name}</span>
                      <strong>{duration(t.workedMinutes)}</strong>
                    </div>
                    <div className={styles.track}>
                      <span
                        style={{
                          width: `${(t.workedMinutes / maxMinutes) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {!data.trainers.length && (
                  <p className="muted">
                    Тренеров пока нет. Назначьте роль в разделе «Пользователи».
                  </p>
                )}
              </div>
            </section>
            <section className={styles.card}>
              <h2>Заполняемость по дням</h2>
              <p className="muted">
                Записанные участники / места в расписании. Отменённые записи и
                занятия исключены.
              </p>
              <div className={styles.dailyScroll}>
                <div
                  className={styles.daily}
                  role="img"
                  aria-label="Заполняемость занятий по дням"
                >
                  {data.days.map((d) => {
                    const rate = d.capacity
                      ? Math.round((d.booked / d.capacity) * 100)
                      : 0;
                    return (
                      <div
                        className={styles.day}
                        key={d.date}
                        tabIndex={0}
                        title={`${shortDate(d.date)}: ${d.booked} из ${d.capacity} мест, ${d.sessions} занятий`}
                        aria-label={`${shortDate(d.date)}: ${rate}%, ${d.booked} из ${d.capacity} мест`}
                      >
                        <span>{d.capacity ? rate + "%" : "—"}</span>
                        <div className={styles.dayTrack}>
                          <i style={{ height: `${Math.min(rate, 100)}%` }} />
                        </div>
                        <small>{shortDate(d.date)}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
          <section className={styles.card}>
            <h2>Учёт проведённых занятий</h2>
            <p className="muted">
              Подтвердите длительность после занятия. Если оно не состоялось,
              укажите 0 минут и причину. Повторное сохранение заменяет запись,
              часы не дублируются.
            </p>
            <div className={styles.filters}>
              <SelectField
                aria-label="Тренер для учёта часов"
                value={trainerId}
                onChange={(e) => {
                  setTrainer(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все тренеры</option>
                {data.trainers.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
              <label className="inline-check">
                <Input
                  type="checkbox"
                  checked={pendingOnly}
                  onChange={(e) => {
                    setPendingOnly(e.target.checked);
                    setPage(1);
                  }}
                />
                Только без подтверждения
              </label>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Занятие</th>
                    <th>Тренер</th>
                    <th>По расписанию</th>
                    <th>Учтено</th>
                    <th>
                      <span className="sr-only">Действие</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice((currentPage - 1) * 12, currentPage * 12)
                    .map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.workout}</strong>
                          <small>
                            {dateTime(s.startAt)} · {s.hall}
                          </small>
                        </td>
                        <td>{s.trainer}</td>
                        <td>{duration(s.plannedMinutes)}</td>
                        <td>
                          {s.workLog ? (
                            <>
                              <span className="status-pill">
                                {duration(s.workLog.minutes)}
                              </span>
                              {s.workLog.note && (
                                <small>{s.workLog.note}</small>
                              )}
                            </>
                          ) : (
                            <span className="muted">Не подтверждено</span>
                          )}
                        </td>
                        <td>
                          <Button
                            variant={s.workLog ? "outline" : "default"}
                            disabled={
                              !valid || query.isFetching || !!query.error
                            }
                            onClick={() => setEditing(s)}
                          >
                            {s.workLog ? "Изменить" : "Учесть часы"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className={styles.empty}>
                За выбранный период подходящих прошедших занятий нет.
              </p>
            )}
            {rows.length > 12 && (
              <div className={styles.pagination}>
                <span>
                  {currentPage} / {Math.ceil(rows.length / 12)}
                </span>
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Назад
                </Button>
                <Button
                  variant="outline"
                  disabled={currentPage * 12 >= rows.length}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Далее
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Учесть время занятия</DialogTitle>
            <DialogDescription>
              {editing?.workout} · {editing?.trainer}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <HoursForm
              key={`${editing.id}-${editing.workLog?.version ?? 0}`}
              session={editing}
              done={() => {
                setEditing(null);
                void qc.invalidateQueries({ queryKey: ["trainer-hours"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function HoursForm({
  session,
  done,
}: {
  session: WorkSession;
  done: () => void;
}) {
  const [minutes, setMinutes] = useState(
    String(session.workLog?.minutes ?? session.plannedMinutes),
  );
  const [note, setNote] = useState(session.workLog?.note ?? "");
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      api(`/analytics/trainer-hours/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          minutes: Number(minutes),
          note,
          version: session.workLog?.version ?? 0,
        }),
      }),
    onSuccess: () => {
      toast.success("Время занятия учтено");
      done();
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["trainer-hours"] });
    },
  });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="muted">
        {dateTime(session.startAt)} · по расписанию{" "}
        {duration(session.plannedMinutes)}.
      </p>
      <Label htmlFor="worked-minutes">Отработано минут</Label>
      <Input
        id="worked-minutes"
        type="number"
        min={0}
        max={1440}
        step={1}
        required
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        disabled={save.isPending}
      />
      <Label htmlFor="hours-note">
        {Number(minutes) !== session.plannedMinutes
          ? "Причина изменения"
          : "Комментарий (необязательно)"}
      </Label>
      <Input
        id="hours-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        minLength={Number(minutes) !== session.plannedMinutes ? 3 : undefined}
        required={Number(minutes) !== session.plannedMinutes}
        disabled={save.isPending}
      />
      {save.error && (
        <p role="alert" className="form-error">
          {save.error.message}
        </p>
      )}
      <Button disabled={save.isPending}>
        {save.isPending ? "Сохраняем…" : "Подтвердить время"}
      </Button>
    </form>
  );
}
