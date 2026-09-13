"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { dateOnly, dateTime } from "@/lib/format";
import { localDay } from "@/features/schedule/types";
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
import {
  type Assignment,
  type Program,
  type Area,
  type PublishedDay,
  type DayLog,
  type ActualSet,
  states,
  today,
} from "./types";
const root = (area: Area) =>
  `/${area}/${area === "account" ? "programs" : "assignments"}`;
export function AssignmentList({
  area,
  clientId,
}: {
  area: Area;
  clientId?: string;
}) {
  const { params, set } = useUrlState();
  clientId = clientId ?? params.get("clientId") ?? undefined;
  const status = params.get("status") ?? "",
    setStatus = (v: string) => set("status", v),
    page = Number(params.get("page")) || 1,
    setPage = (v: number) => set("page", String(v)),
    list = useQuery({
      queryKey: ["assignments", area, status, page, clientId],
      queryFn: () =>
        api<{ items: Assignment[]; total: number }>(
          `/program-assignments?area=${area}&page=${page}${status ? "&status=" + status : ""}${clientId ? "&clientId=" + clientId : ""}`,
        ),
    });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">ШАГ ЗА ШАГОМ</span>
          <h1>
            {area === "account" ? "Мои программы" : "Назначения клиентам"}
          </h1>
          <p>План занятий, фактические результаты и обратная связь.</p>
        </div>
        {area !== "account" && (
          <Button asChild variant="outline">
            <Link href={`/${area}/programs`}>Каталог программ</Link>
          </Button>
        )}
      </div>
      <div className="toolbar">
        <select
          className="form-select"
          aria-label="Статус программы"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Все программы</option>
          {Object.entries(states).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {list.error ? (
        <p className="form-error">{list.error.message}</p>
      ) : !list.data ? (
        <p role="status">Загружаем назначения…</p>
      ) : (
        <>
          <div className="exercise-library">
            {list.data.items.map((a) => (
              <article className="surface" key={a.id}>
                <span className="status-pill">{states[a.status]}</span>
                <h2>
                  <Link href={`${root(area)}/${a.id}`}>
                    {a.programVersion.title}
                  </Link>
                </h2>
                <p className="muted">
                  {area === "account" ? a.trainer.user.name : a.client.name} · с{" "}
                  {dateOnly(a.startsOn)}
                </p>
                <p>{a.programVersion.goal}</p>
                <div className="program-progress">
                  <progress
                    aria-label="Выполнение программы"
                    max={a.programVersion._count?.days ?? 1}
                    value={a._count?.logs ?? 0}
                  />
                  <span>
                    {a._count?.logs ?? 0} из{" "}
                    {a.programVersion._count?.days ?? 0} занятий
                  </span>
                </div>
                <Button asChild variant="outline">
                  <Link href={`${root(area)}/${a.id}`}>
                    Открыть программу →
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          {!list.data.items.length && (
            <div className="surface empty-state">
              <h2>Здесь пока нет программ</h2>
              <p>
                {area === "account"
                  ? "Тренер подберёт план и назначит его вам."
                  : "Назначьте клиенту опубликованную программу."}
              </p>
            </div>
          )}
          <div className="pagination">
            <span>Всего: {list.data.total}</span>
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Назад
            </Button>
            <Button
              variant="ghost"
              disabled={page * 20 >= list.data.total}
              onClick={() => setPage(page + 1)}
            >
              Далее
            </Button>
          </div>
        </>
      )}
    </>
  );
}
export function AssignmentDetail({ id, area }: { id: string; area: Area }) {
  const qc = useQueryClient(),
    [editDay, setEditDay] = useState<PublishedDay | null>(null),
    [replacement, setReplacement] = useState(false),
    [week, setWeek] = useState(0),
    a = useQuery({
      queryKey: ["assignment", id],
      queryFn: () => api<Assignment>("/program-assignments/" + id),
    }),
    stop = useMutation({
      mutationFn: (reason: string) =>
        post(
          "/program-assignments/" + id + "/stop",
          { version: a.data!.version, reason },
          crypto.randomUUID(),
        ),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["assignment", id] });
        void qc.invalidateQueries({ queryKey: ["assignments"] });
      },
      onError: (e) => toast.error(e.message),
    });
  if (a.error) return <p className="form-error">{a.error.message}</p>;
  if (!a.data) return <p role="status">Открываем программу…</p>;
  const data = a.data,
    completed = data.logs.filter((l) => l.completedAt).length;
  return (
    <>
      <Link href={root(area)} className="back-link">
        ← Все назначения
      </Link>
      <div className="page-heading">
        <span className="eyebrow">
          ПРОГРАММА · ВЕРСИЯ {data.programVersion.number}
        </span>
        <h1>{data.programVersion.title}</h1>
        <p>{data.programVersion.goal}</p>
        <div className="flex flex-wrap gap-3 mt-4">
          <span className="status-pill">{states[data.status]}</span>
          <span>
            {data.client.name} · {data.trainer.user.name} · с{" "}
            {dateOnly(data.startsOn)}
          </span>
        </div>
      </div>
      <div className="surface mb-6">
        <div className="program-progress">
          <progress
            aria-label="Выполнение программы"
            max={data.programVersion.days.length}
            value={completed}
          />
          <strong>
            {completed} из {data.programVersion.days.length} занятий
          </strong>
        </div>
        {area !== "account" && data.status === "ACTIVE" && (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setReplacement(true)}>
              Заменить версию
            </Button>
            <Button
              variant="ghost"
              disabled={stop.isPending}
              onClick={() => {
                const reason = window.prompt("Причина прекращения программы");
                if (reason) stop.mutate(reason);
              }}
            >
              Прекратить программу
            </Button>
          </div>
        )}
        {data.replacedById && (
          <Link
            className="table-link"
            href={`${root(area)}/${data.replacedById}`}
          >
            Перейти к обновлённой программе →
          </Link>
        )}
      </div>
      <div className="toolbar">
        <select
          className="form-select"
          aria-label="Неделя программы"
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
        >
          <option value={0}>Все недели</option>
          {Array.from({ length: data.programVersion.weeks }, (_, i) => (
            <option key={i} value={i + 1}>
              Неделя {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div className="program-days">
        {data.programVersion.days
          .filter((d) => !week || d.weekNumber === week)
          .map((day) => {
            const log = data.logs.find((l) => l.dayId === day.id);
            return (
              <section className="surface" key={day.id}>
                <div className="heading-actions">
                  <div>
                    <span className="eyebrow">
                      НЕДЕЛЯ {day.weekNumber} · ДЕНЬ {day.dayIndex}
                    </span>
                    <h2>{day.title}</h2>
                  </div>
                  <span className="status-pill">
                    {log?.completedAt
                      ? "Выполнено"
                      : log
                        ? "Есть результаты"
                        : "Предстоит"}
                  </span>
                </div>
                {day.exercises.map((e) => (
                  <article className="prescription" key={e.id}>
                    <h3>{e.exerciseSnapshot.name}</h3>
                    <p>
                      <strong>
                        {e.sets} × {e.reps ?? e.durationSeconds}{" "}
                        {e.reps !== null ? "повторений" : "секунд"}
                      </strong>
                      {e.weightKg !== null ? ` · ${e.weightKg} кг` : ""} · отдых{" "}
                      {e.restSeconds} сек.
                    </p>
                    {e.notes && <p>{e.notes}</p>}
                    <details>
                      <summary>Техника выполнения</summary>
                      <p className="whitespace-pre-line">
                        {e.exerciseSnapshot.instructions}
                      </p>
                      <p className="muted">
                        {e.exerciseSnapshot.equipment.join(", ") ||
                          "Без оборудования"}
                      </p>
                    </details>
                    {log && (
                      <div className="actual-summary">
                        {log.sets
                          .filter((s) => s.programExerciseId === e.id)
                          .map((s) => (
                            <span key={s.setIndex}>
                              #{s.setIndex}: {s.actualReps ?? s.actualSeconds}{" "}
                              {s.actualReps !== null ? "повт." : "сек."}
                              {s.actualWeightKg !== null
                                ? ` / ${s.actualWeightKg} кг`
                                : ""}
                            </span>
                          ))}
                      </div>
                    )}
                  </article>
                ))}
                {log && (
                  <div className="program-log-note">
                    <p>
                      {dateOnly(log.performedOn)}
                      {log.comment ? " · " + log.comment : ""}
                    </p>
                    <details>
                      <summary>
                        История изменений ({log.revisions.length})
                      </summary>
                      {log.revisions.map((r) => (
                        <div className="timeline" key={r.version}>
                          <strong>
                            Запись {r.version} · {dateTime(r.createdAt)}
                          </strong>
                          <p>
                            {r.snapshot.completed
                              ? "День завершён"
                              : "Промежуточный результат"}{" "}
                            · {r.snapshot.sets.length} подходов
                          </p>
                          {r.snapshot.comment && <p>{r.snapshot.comment}</p>}
                          <p className="muted">
                            {r.snapshot.sets
                              .map(
                                (s) =>
                                  `${day.exercises.find((e) => e.id === s.programExerciseId)?.exerciseSnapshot.name ?? "Упражнение"} #${s.setIndex}: ${s.actualReps ?? s.actualSeconds} ${s.actualReps !== null ? "повт." : "сек."}${s.actualWeightKg !== null ? " / " + s.actualWeightKg + " кг" : ""}`,
                              )
                              .join("; ")}
                          </p>
                        </div>
                      ))}
                    </details>
                  </div>
                )}
                {area === "account" && data.status === "ACTIVE" && (
                  <Button
                    className="mt-5"
                    disabled={localDay(new Date(data.startsOn)) > today()}
                    onClick={() => setEditDay(day)}
                  >
                    {log ? "Обновить результаты" : "Записать результаты"}
                  </Button>
                )}
              </section>
            );
          })}
      </div>
      <Comments key={data.id} data={data} area={area} />
      <Dialog
        open={!!editDay}
        onOpenChange={(v) => {
          if (!v) setEditDay(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editDay?.title}</DialogTitle>
            <DialogDescription>
              Укажите фактические результаты. Для завершения дня заполните
              каждый подход.
            </DialogDescription>
          </DialogHeader>
          {editDay && (
            <LogForm
              assignment={data}
              day={editDay}
              log={data.logs.find((l) => l.dayId === editDay.id)}
              done={() => {
                setEditDay(null);
                void qc.invalidateQueries({ queryKey: ["assignment", id] });
                void qc.invalidateQueries({ queryKey: ["assignments"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={replacement} onOpenChange={setReplacement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Замена версии</DialogTitle>
            <DialogDescription>
              История текущего назначения сохранится. Новый план начнётся с
              отдельного журнала.
            </DialogDescription>
          </DialogHeader>
          {replacement && <ReplaceForm assignment={data} area={area} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
function LogForm({
  assignment,
  day,
  log,
  done,
}: {
  assignment: Assignment;
  day: PublishedDay;
  log?: DayLog;
  done: () => void;
}) {
  const [complete, setComplete] = useState(!!log?.completedAt),
    save = useMutation({
      mutationFn: (body: unknown) =>
        api(`/program-assignments/${assignment.id}/days/${day.id}/log`, {
          method: "PUT",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(body),
        }),
      onSuccess: () => {
        toast.success("Результаты сохранены");
        done();
      },
    });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          sets: ActualSet[] = [];
        for (const ex of day.exercises)
          for (let n = 1; n <= ex.sets; n++) {
            const value = String(f.get(`${ex.id}-${n}`)),
              weight = String(f.get(`${ex.id}-${n}-weight`));
            if (value !== "")
              sets.push({
                programExerciseId: ex.id,
                setIndex: n,
                actualReps: ex.reps !== null ? Number(value) : null,
                actualSeconds: ex.reps === null ? Number(value) : null,
                actualWeightKg: weight === "" ? null : Number(weight),
              });
          }
        save.mutate({
          version: log?.version ?? 0,
          performedOn: f.get("performedOn"),
          completed: complete,
          comment: f.get("comment"),
          sets,
        });
      }}
    >
      <Label htmlFor="performed-on">Дата занятия</Label>
      <Input
        id="performed-on"
        name="performedOn"
        type="date"
        required
        min={localDay(new Date(assignment.startsOn))}
        max={today()}
        defaultValue={log ? localDay(new Date(log.performedOn)) : today()}
      />
      {day.exercises.map((ex) => (
        <fieldset key={ex.id} className="log-exercise">
          <legend>{ex.exerciseSnapshot.name}</legend>
          {Array.from({ length: ex.sets }, (_, i) => {
            const n = i + 1,
              actual = log?.sets.find(
                (s) => s.programExerciseId === ex.id && s.setIndex === n,
              );
            return (
              <div className="actual-input-row" key={n}>
                <span>Подход {n}</span>
                <label>
                  {ex.reps !== null ? "Повторения" : "Секунды"}
                  <Input
                    aria-label={`${ex.exerciseSnapshot.name}, подход ${n}, результат`}
                    type="number"
                    min={1}
                    max={ex.reps !== null ? 500 : 14400}
                    name={`${ex.id}-${n}`}
                    required={complete}
                    defaultValue={
                      actual?.actualReps ?? actual?.actualSeconds ?? ""
                    }
                    placeholder={String(ex.reps ?? ex.durationSeconds)}
                  />
                </label>
                <label>
                  Вес, кг
                  <Input
                    aria-label={`${ex.exerciseSnapshot.name}, подход ${n}, вес`}
                    type="number"
                    min={0}
                    max={500}
                    step="0.5"
                    name={`${ex.id}-${n}-weight`}
                    defaultValue={actual?.actualWeightKg ?? ""}
                    placeholder={
                      ex.weightKg !== null ? String(ex.weightKg) : "—"
                    }
                  />
                </label>
              </div>
            );
          })}
        </fieldset>
      ))}
      <Label htmlFor="log-comment">Самочувствие и заметки</Label>
      <textarea
        className="form-textarea"
        id="log-comment"
        name="comment"
        maxLength={1000}
        rows={3}
        defaultValue={log?.comment ?? ""}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={complete}
          onChange={(e) => setComplete(e.target.checked)}
        />
        Завершить день программы
      </label>
      {save.error && <p className="form-error">{save.error.message}</p>}
      <Button disabled={save.isPending}>Сохранить результаты</Button>
    </form>
  );
}
function Comments({ data, area }: { data: Assignment; area: Area }) {
  const qc = useQueryClient(),
    save = useMutation({
      mutationFn: (body: unknown) =>
        post(
          `/program-assignments/${data.id}/comments`,
          body,
          crypto.randomUUID(),
        ),
      onSuccess: () =>
        void qc.invalidateQueries({ queryKey: ["assignment", data.id] }),
    });
  return (
    <section className="surface mt-8">
      <h2>Обратная связь</h2>
      {data.comments.length ? (
        data.comments.map((c) => (
          <article className="timeline" key={c.id}>
            <strong>{c.authorName}</strong>
            <span className="muted">
              {" "}
              · {dateTime(c.createdAt)}
              {c.visibility === "TEAM" ? " · Только команде" : ""}
            </span>
            <p className="whitespace-pre-line">{c.body}</p>
          </article>
        ))
      ) : (
        <p className="muted">Обсудите нагрузку и самочувствие с тренером.</p>
      )}
      <form
        className="form-stack mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          save.mutate(
            {
              body: f.get("body"),
              visibility: f.get("visibility") ?? "SHARED",
            },
            { onSuccess: () => form.reset() },
          );
        }}
      >
        <Label htmlFor="program-comment">Комментарий</Label>
        <textarea
          id="program-comment"
          name="body"
          className="form-textarea"
          rows={3}
          required
          maxLength={2000}
        />
        {area !== "account" && (
          <select
            className="form-select"
            name="visibility"
            aria-label="Кому виден комментарий"
          >
            <option value="SHARED">Клиенту и тренеру</option>
            <option value="TEAM">Только команде клуба</option>
          </select>
        )}
        {save.error && <p className="form-error">{save.error.message}</p>}
        <Button disabled={save.isPending}>Отправить комментарий</Button>
      </form>
    </section>
  );
}
function ReplaceForm({
  assignment,
  area,
}: {
  assignment: Assignment;
  area: Area;
}) {
  const router = useRouter(),
    p = useQuery({
      queryKey: ["program", assignment.programId],
      queryFn: () => api<Program>("/programs/" + assignment.programId),
    }),
    save = useMutation({
      mutationFn: (body: unknown) =>
        post<{ id: string }>(
          `/program-assignments/${assignment.id}/replace`,
          body,
          crypto.randomUUID(),
        ),
      onSuccess: (a) => router.push(`${root(area)}/${a.id}`),
    });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({
          version: assignment.version,
          programVersionId: f.get("programVersionId"),
          startsOn: f.get("startsOn"),
          reason: f.get("reason"),
        });
      }}
    >
      <Label htmlFor="replace-version">Опубликованная версия</Label>
      <select
        className="form-select"
        id="replace-version"
        name="programVersionId"
        required
        defaultValue=""
      >
        <option value="">Выберите версию</option>
        {p.data?.versions
          .filter((v) => v.id !== assignment.programVersion.id)
          .map((v) => (
            <option key={v.id} value={v.id}>
              Версия {v.number} · {v.title}
            </option>
          ))}
      </select>
      <Label htmlFor="replace-start">Дата начала</Label>
      <Input
        id="replace-start"
        name="startsOn"
        type="date"
        defaultValue={today()}
        min={today()}
        required
      />
      <Label htmlFor="replace-reason">Причина</Label>
      <Input
        id="replace-reason"
        name="reason"
        minLength={3}
        maxLength={500}
        required
      />
      {(save.error || p.error) && (
        <p className="form-error">{(save.error ?? p.error)?.message}</p>
      )}
      <Button disabled={save.isPending}>Заменить программу</Button>
    </form>
  );
}
