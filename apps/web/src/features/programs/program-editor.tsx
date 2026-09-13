"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
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
import { dateTime } from "@/lib/format";
import {
  type Area,
  type Program,
  type Exercise,
  type Draft,
  type Prescription,
  levels,
  today,
} from "./types";
export function ProgramList({ area }: { area: Area }) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [archived, setArchived] = useState(false);
  const list = useQuery({
    queryKey: ["programs", area, q, page, archived],
    queryFn: () =>
      api<{ items: Program[]; total: number }>(
        `/programs?area=${area}&q=${encodeURIComponent(q)}&page=${page}&archived=${archived}`,
      ),
  });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">ПЕРСОНАЛЬНЫЙ ПОДХОД</span>
          <h1>Программы занятий</h1>
          <p>От первого движения до устойчивого результата.</p>
        </div>
        <Button asChild>
          <Link href={`/${area}/programs/new`}>Создать программу</Link>
        </Button>
      </div>
      <div className="toolbar">
        <Input
          placeholder="Название программы"
          aria-label="Поиск программ"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
            }}
          />{" "}
          Архив
        </label>
        <Button asChild variant="outline">
          <Link href={`/${area}/assignments`}>Назначения клиентам</Link>
        </Button>
      </div>
      {list.error ? (
        <p className="form-error">{list.error.message}</p>
      ) : !list.data ? (
        <p role="status">Загружаем программы…</p>
      ) : (
        <>
          <div className="exercise-library">
            {list.data.items.map((p) => (
              <article className="surface" key={p.id}>
                <span className="eyebrow">
                  {p.versions[0]
                    ? `ВЕРСИЯ ${p.versions[0].number}`
                    : "ЧЕРНОВИК"}
                </span>
                <h2>
                  <Link href={`/${area}/programs/${p.id}`}>{p.title}</Link>
                </h2>
                <p>{p.author.user.name}</p>
                <p className="muted">
                  {p.versions[0]
                    ? `${p.versions[0].weeks} нед. · ${levels[p.versions[0].level]}`
                    : "Готовится к публикации"}
                </p>
                <Button variant="outline" asChild>
                  <Link href={`/${area}/programs/${p.id}`}>
                    Открыть конструктор →
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          {!list.data.items.length && (
            <div className="surface empty-state">
              Программ пока нет. Создайте первую или измените поиск.
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
export function ProgramEditor({ id, area }: { id: string; area: Area }) {
  const p = useQuery({
    queryKey: ["program", id],
    queryFn: () => api<Program>("/programs/" + id),
    enabled: id !== "new",
  });
  if (p.error) return <p className="form-error">{p.error.message}</p>;
  if (id !== "new" && !p.data)
    return <p role="status">Открываем конструктор…</p>;
  return (
    <Editor
      key={p.data ? `${p.data.id}:${p.data.version}` : "new"}
      program={p.data}
      area={area}
    />
  );
}
const initial: Draft = {
  title: "",
  goal: "",
  level: "BEGINNER",
  weeks: 1,
  days: [
    { weekNumber: 1, dayIndex: 1, title: "Первое занятие", exercises: [] },
  ],
};
function Editor({ program, area }: { program?: Program; area: Area }) {
  const [draft, setDraft] = useState<Draft>(program?.draft ?? initial),
    [author, setAuthor] = useState(""),
    [assign, setAssign] = useState(false),
    [exerciseQ, setExerciseQ] = useState(""),
    qc = useQueryClient(),
    router = useRouter();
  const library = useQuery({
    queryKey: ["exercises", "picker", exerciseQ],
    queryFn: () =>
      api<{ items: Exercise[] }>(
        `/exercises?limit=100&q=${encodeURIComponent(exerciseQ)}`,
      ),
  });
  const selectedIds = [
    ...new Set(draft.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))),
  ]
    .sort()
    .join(",");
  const selected = useQuery({
    queryKey: ["exercises", "selected", selectedIds],
    queryFn: () =>
      post<Exercise[]>("/exercises/selection", { ids: selectedIds.split(",") }),
    enabled: !!selectedIds,
  });
  const trainers = useQuery({
    queryKey: ["trainers", "program-author"],
    queryFn: () =>
      api<{ items: { id: string; user: { name: string } }[] }>(
        "/catalog/trainers?limit=100",
      ),
    enabled: area === "admin" && !program,
  });
  const save = useMutation({
    mutationFn: () =>
      program
        ? api<Program>("/programs/" + program.id, {
            method: "PUT",
            body: JSON.stringify({ version: program.version, draft }),
          })
        : post<Program>("/programs", {
            draft,
            ...(area === "admin" ? { authorTrainerId: author } : {}),
          }),
    onSuccess: (p) => {
      toast.success("Черновик сохранён");
      void qc.invalidateQueries({ queryKey: ["programs"] });
      void qc.invalidateQueries({ queryKey: ["program", p.id] });
      if (!program) router.replace(`/${area}/programs/${p.id}`);
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      post(
        "/programs/" + program!.id + "/publish",
        { version: program!.version },
        crypto.randomUUID(),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["program", program!.id] });
      void qc.invalidateQueries({ queryKey: ["programs"] });
      toast.success("Версия опубликована");
    },
  });
  const archive = useMutation({
    mutationFn: (reason: string) =>
      post("/programs/" + program!.id + "/archive", {
        version: program!.version,
        archived: !program!.archivedAt,
        reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["program", program!.id] });
      void qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(program?.draft),
    locked = !!program?.archivedAt;
  function change(day: number, exercise: number, patch: Partial<Prescription>) {
    setDraft((d) => ({
      ...d,
      days: d.days.map((v, i) =>
        i === day
          ? {
              ...v,
              exercises: v.exercises.map((e, j) =>
                j === exercise ? { ...e, ...patch } : e,
              ),
            }
          : v,
      ),
    }));
  }
  return (
    <>
      <Link href={`/${area}/programs`} className="back-link">
        ← Все программы
      </Link>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">
            КОНСТРУКТОР · {locked ? "АРХИВ" : "ЧЕРНОВИК"}
          </span>
          <h1>{program?.title ?? "Новая программа"}</h1>
          <p>Сохраните изменения, затем опубликуйте версию для назначения.</p>
        </div>
        {program && (
          <Button
            variant="ghost"
            onClick={() => {
              const reason = window.prompt("Причина изменения архива");
              if (reason) archive.mutate(reason);
            }}
            disabled={archive.isPending}
          >
            {locked ? "Восстановить" : "В архив"}
          </Button>
        )}
      </div>
      <form
        className="program-builder"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset
          disabled={locked || save.isPending || publish.isPending}
          className="contents"
        >
          <section className="surface form-stack">
            <Label htmlFor="program-title">Название программы</Label>
            <Input
              id="program-title"
              value={draft.title}
              required
              minLength={2}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Label htmlFor="program-goal">Цель</Label>
            <textarea
              id="program-goal"
              className="form-textarea"
              rows={3}
              value={draft.goal}
              required
              minLength={3}
              maxLength={1000}
              onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
            />
            <div className="form-grid">
              <div>
                <Label htmlFor="program-level">Уровень</Label>
                <select
                  className="form-select"
                  id="program-level"
                  value={draft.level}
                  onChange={(e) =>
                    setDraft({ ...draft, level: e.target.value })
                  }
                >
                  {Object.entries(levels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="program-weeks">Недель</Label>
                <Input
                  id="program-weeks"
                  type="number"
                  min={1}
                  max={12}
                  value={draft.weeks}
                  onChange={(e) =>
                    setDraft({ ...draft, weeks: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            {area === "admin" && !program && (
              <>
                <Label htmlFor="program-author">Тренер — автор</Label>
                <select
                  id="program-author"
                  className="form-select"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  required
                >
                  <option value="">Выберите тренера</option>
                  {trainers.data?.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.user.name}
                    </option>
                  ))}
                </select>
                {trainers.error && (
                  <p className="form-error">{trainers.error.message}</p>
                )}
              </>
            )}
          </section>
          <div className="program-days">
            {draft.days.map((day, di) => (
              <section className="surface program-day" key={di}>
                <div className="heading-actions">
                  <h2>Занятие {di + 1}</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={draft.days.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        days: draft.days.filter((_, i) => i !== di),
                      })
                    }
                  >
                    Удалить день
                  </Button>
                </div>
                <div className="form-grid">
                  <label>
                    Неделя
                    <Input
                      aria-label={`Неделя занятия ${di + 1}`}
                      type="number"
                      min={1}
                      max={draft.weeks}
                      value={day.weekNumber}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          days: draft.days.map((d, i) =>
                            i === di
                              ? { ...d, weekNumber: Number(e.target.value) }
                              : d,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    День недели
                    <select
                      className="form-select"
                      aria-label={`День занятия ${di + 1}`}
                      value={day.dayIndex}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          days: draft.days.map((d, i) =>
                            i === di
                              ? { ...d, dayIndex: Number(e.target.value) }
                              : d,
                          ),
                        })
                      }
                    >
                      {[
                        "Понедельник",
                        "Вторник",
                        "Среда",
                        "Четверг",
                        "Пятница",
                        "Суббота",
                        "Воскресенье",
                      ].map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block mt-4">
                  Название дня
                  <Input
                    value={day.title}
                    required
                    minLength={2}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        days: draft.days.map((d, i) =>
                          i === di ? { ...d, title: e.target.value } : d,
                        ),
                      })
                    }
                  />
                </label>
                {day.exercises.map((e, ei) => {
                  const source = (selected.data ?? library.data?.items)?.find(
                      (x) => x.id === e.exerciseId,
                    ),
                    published = program?.versions
                      .flatMap((v) => v.days.flatMap((d) => d.exercises))
                      .find((x) => x.exerciseId === e.exerciseId);
                  return (
                    <article className="prescription" key={ei}>
                      <div className="heading-actions">
                        <h3>
                          {ei + 1}.{" "}
                          {source?.name ??
                            published?.exerciseSnapshot.name ??
                            "Упражнение из каталога"}
                        </h3>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label="Поднять упражнение"
                            disabled={ei === 0}
                            onClick={() => {
                              const exercises = [...day.exercises];
                              [exercises[ei - 1], exercises[ei]] = [
                                exercises[ei]!,
                                exercises[ei - 1]!,
                              ];
                              setDraft({
                                ...draft,
                                days: draft.days.map((d, i) =>
                                  i === di ? { ...d, exercises } : d,
                                ),
                              });
                            }}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label="Убрать упражнение"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                days: draft.days.map((d, i) =>
                                  i === di
                                    ? {
                                        ...d,
                                        exercises: d.exercises.filter(
                                          (_, j) => j !== ei,
                                        ),
                                      }
                                    : d,
                                ),
                              })
                            }
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                      <div className="prescription-fields">
                        <label>
                          Подходы
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={e.sets}
                            onChange={(v) =>
                              change(di, ei, { sets: Number(v.target.value) })
                            }
                          />
                        </label>
                        <label>
                          {e.reps !== null ? "Повторения" : "Секунды"}
                          <Input
                            type="number"
                            min={1}
                            max={e.reps !== null ? 200 : 7200}
                            value={e.reps ?? e.durationSeconds ?? 0}
                            onChange={(v) =>
                              change(
                                di,
                                ei,
                                e.reps !== null
                                  ? { reps: Number(v.target.value) }
                                  : { durationSeconds: Number(v.target.value) },
                              )
                            }
                          />
                        </label>
                        <label>
                          Вес, кг
                          <Input
                            type="number"
                            min={0}
                            max={500}
                            step="0.5"
                            value={e.weightKg ?? ""}
                            onChange={(v) =>
                              change(di, ei, {
                                weightKg:
                                  v.target.value === ""
                                    ? null
                                    : Number(v.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Отдых, сек.
                          <Input
                            type="number"
                            min={0}
                            max={600}
                            value={e.restSeconds}
                            onChange={(v) =>
                              change(di, ei, {
                                restSeconds: Number(v.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Комментарий тренера
                        <Input
                          value={e.notes}
                          maxLength={500}
                          onChange={(v) =>
                            change(di, ei, { notes: v.target.value })
                          }
                        />
                      </label>
                    </article>
                  );
                })}
                <div className="form-stack mt-5">
                  <Input
                    aria-label={`Поиск упражнения для занятия ${di + 1}`}
                    placeholder="Поиск в каталоге упражнений"
                    value={exerciseQ}
                    onChange={(e) => setExerciseQ(e.target.value)}
                  />
                  <select
                    className="form-select"
                    aria-label={`Добавить упражнение в занятие ${di + 1}`}
                    value=""
                    disabled={day.exercises.length >= 20}
                    onChange={(v) => {
                      const source = library.data?.items.find(
                        (e) => e.id === v.target.value,
                      );
                      if (!source) return;
                      setDraft({
                        ...draft,
                        days: draft.days.map((d, i) =>
                          i === di
                            ? {
                                ...d,
                                exercises: [
                                  ...d.exercises,
                                  {
                                    exerciseId: source.id,
                                    sets: 3,
                                    reps:
                                      source.metricType === "REPS" ? 12 : null,
                                    durationSeconds:
                                      source.metricType === "DURATION"
                                        ? 30
                                        : null,
                                    weightKg: null,
                                    restSeconds: 60,
                                    notes: "",
                                  },
                                ],
                              }
                            : d,
                        ),
                      });
                    }}
                  >
                    <option value="">+ Добавить упражнение</option>
                    {library.data?.items.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  {library.error && (
                    <p className="form-error">{library.error.message}</p>
                  )}
                </div>
              </section>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={draft.days.length >= 84}
            onClick={() => {
              let slot = 0;
              while (
                slot < draft.weeks * 7 &&
                draft.days.some(
                  (d) => (d.weekNumber - 1) * 7 + d.dayIndex - 1 === slot,
                )
              )
                slot++;
              if (slot >= draft.weeks * 7) {
                toast.error("Увеличьте число недель — все дни уже добавлены");
                return;
              }
              setDraft({
                ...draft,
                days: [
                  ...draft.days,
                  {
                    weekNumber: Math.floor(slot / 7) + 1,
                    dayIndex: (slot % 7) + 1,
                    title: "Новое занятие",
                    exercises: [],
                  },
                ],
              });
            }}
          >
            Добавить тренировочный день
          </Button>
          <div className="builder-actions">
            <Button
              disabled={
                save.isPending ||
                !draft.days.every((d) => d.exercises.length > 0)
              }
            >
              {save.isPending ? "Сохраняем…" : "Сохранить черновик"}
            </Button>
            {program && (
              <Button
                variant="outline"
                type="button"
                disabled={dirty || publish.isPending}
                onClick={() => publish.mutate()}
              >
                Опубликовать версию
              </Button>
            )}
            {dirty && program && (
              <span className="muted">Есть несохранённые изменения</span>
            )}
          </div>
        </fieldset>
        {(save.error || publish.error) && (
          <p className="form-error">{(save.error ?? publish.error)?.message}</p>
        )}
      </form>
      {program && (
        <section className="surface mt-8">
          <div className="heading-actions">
            <h2>Опубликованные версии</h2>
            <Button
              disabled={!program.versions.length || locked}
              onClick={() => setAssign(true)}
            >
              Назначить клиенту
            </Button>
          </div>
          {program.versions.length ? (
            program.versions.map((v) => (
              <details className="program-version" key={v.id}>
                <summary>
                  Версия {v.number} · {v.title} · {dateTime(v.publishedAt)}
                </summary>
                <p>{v.goal}</p>
                {v.days.map((d) => (
                  <p key={d.id}>
                    Неделя {d.weekNumber}, день {d.dayIndex}: {d.title} —{" "}
                    {d.exercises
                      .map(
                        (e) =>
                          `${e.exerciseSnapshot.name} (${e.sets} × ${e.reps ?? e.durationSeconds}${e.reps !== null ? " повт." : " сек."})`,
                      )
                      .join("; ")}
                  </p>
                ))}
              </details>
            ))
          ) : (
            <p className="muted">После публикации версия появится здесь.</p>
          )}
        </section>
      )}
      <Dialog open={assign} onOpenChange={setAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Назначить программу</DialogTitle>
            <DialogDescription>
              Клиент получит выбранную версию. Дальнейшие правки черновика её не
              изменят.
            </DialogDescription>
          </DialogHeader>
          {program && assign && (
            <AssignForm
              program={program}
              area={area}
              done={() => setAssign(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function AssignForm({
  program,
  area,
  done,
}: {
  program: Program;
  area: Area;
  done: () => void;
}) {
  const [q, setQ] = useState(""),
    router = useRouter(),
    clients = useQuery({
      queryKey: ["assignment-clients", area, q],
      queryFn: async () =>
        area === "trainer"
          ? await api<{ id: string; name: string }[]>("/trainer/clients")
          : (
              await api<{ items: { id: string; name: string }[] }>(
                `/catalog/clients?limit=100&q=${encodeURIComponent(q)}`,
              )
            ).items,
    });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      post<{ id: string }>("/program-assignments", data, crypto.randomUUID()),
    onSuccess: (a) => {
      toast.success("Программа назначена");
      done();
      router.push(`/${area}/assignments/${a.id}`);
    },
  });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({
          clientId: f.get("clientId"),
          programVersionId: f.get("programVersionId"),
          startsOn: f.get("startsOn"),
        });
      }}
    >
      {area === "admin" && (
        <Input
          aria-label="Найти клиента"
          placeholder="Поиск клиента"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <Label htmlFor="assign-client">Клиент</Label>
      <select
        className="form-select"
        id="assign-client"
        name="clientId"
        required
        defaultValue=""
      >
        <option value="">Выберите клиента</option>
        {clients.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Label htmlFor="assign-version">Версия</Label>
      <select
        className="form-select"
        id="assign-version"
        name="programVersionId"
        defaultValue={program.versions[0]?.id}
      >
        {program.versions.map((v) => (
          <option key={v.id} value={v.id}>
            Версия {v.number} · {v.title}
          </option>
        ))}
      </select>
      <Label htmlFor="assign-start">Начало</Label>
      <Input
        type="date"
        id="assign-start"
        name="startsOn"
        min={today()}
        defaultValue={today()}
        required
      />
      {(save.error || clients.error) && (
        <p className="form-error">{(save.error ?? clients.error)?.message}</p>
      )}
      <Button disabled={save.isPending}>Назначить программу</Button>
    </form>
  );
}
