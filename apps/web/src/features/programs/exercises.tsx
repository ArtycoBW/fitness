"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post, type User } from "@/lib/api";
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
import type { Exercise } from "./types";
export function Exercises() {
  const [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Exercise | "new" | null>(null),
    qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });
  const list = useQuery({
    queryKey: ["exercises", q, archived, page],
    queryFn: () =>
      api<{ items: Exercise[]; total: number }>(
        `/exercises?q=${encodeURIComponent(q)}&archived=${archived}&page=${page}`,
      ),
  });
  const archive = useMutation({
    mutationFn: ({ e, reason }: { e: Exercise; reason: string }) =>
      post(`/exercises/${e.id}/archive`, {
        version: e.version,
        archived: !e.archivedAt,
        reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["exercises"] });
      toast.success("Каталог обновлён");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">БИБЛИОТЕКА ДВИЖЕНИЙ</span>
          <h1>Упражнения</h1>
          <p>Техника выполнения и показатели для программ занятий.</p>
        </div>
        <Button onClick={() => setEditing("new")}>Добавить упражнение</Button>
      </div>
      <div className="toolbar">
        <Input
          aria-label="Поиск упражнения"
          placeholder="Название или категория"
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
      </div>
      {list.error ? (
        <p className="form-error">{list.error.message}</p>
      ) : !list.data ? (
        <p role="status">Загружаем упражнения…</p>
      ) : (
        <>
          <div className="exercise-library">
            {list.data.items.map((e) => (
              <article className="surface" key={e.id}>
                <span className="eyebrow">{e.category}</span>
                <h2>{e.name}</h2>
                <p className="muted">
                  {e.metricType === "REPS" ? "Повторения" : "Время"} ·{" "}
                  {e.equipment.join(", ") || "Без оборудования"}
                </p>
                <p className="whitespace-pre-line">{e.instructions}</p>
                <div className="flex gap-2 mt-5">
                  {!e.archivedAt && (
                    <Button variant="outline" onClick={() => setEditing(e)}>
                      Изменить
                    </Button>
                  )}
                  {me.data?.roles.some((r) =>
                    ["OWNER", "ADMIN"].includes(r),
                  ) && (
                    <Button
                      variant="ghost"
                      disabled={archive.isPending}
                      onClick={() => {
                        const reason = window.prompt(
                          "Причина изменения архива",
                        );
                        if (reason) archive.mutate({ e, reason });
                      }}
                    >
                      {e.archivedAt ? "Восстановить" : "В архив"}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!list.data.items.length && (
            <div className="surface empty-state">Упражнения не найдены.</div>
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
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Новое упражнение" : "Изменить упражнение"}
            </DialogTitle>
            <DialogDescription>
              Опубликованные программы сохраняют прежнюю технику и параметры.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ExerciseForm
              key={typeof editing === "string" ? "new" : editing.id}
              value={typeof editing === "string" ? undefined : editing}
              done={() => {
                setEditing(null);
                void qc.invalidateQueries({ queryKey: ["exercises"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function ExerciseForm({ value, done }: { value?: Exercise; done: () => void }) {
  const save = useMutation({
    mutationFn: (data: unknown) =>
      value
        ? api(`/exercises/${value.id}`, {
            method: "PUT",
            body: JSON.stringify({ version: value.version, data }),
          })
        : post("/exercises", data),
    onSuccess: () => {
      toast.success("Упражнение сохранено");
      done();
    },
  });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({
          name: f.get("name"),
          category: f.get("category"),
          instructions: f.get("instructions"),
          equipment: String(f.get("equipment"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          metricType: f.get("metricType"),
        });
      }}
    >
      <Label htmlFor="ex-name">Название</Label>
      <Input
        id="ex-name"
        name="name"
        defaultValue={value?.name}
        required
        minLength={2}
        maxLength={120}
      />
      <Label htmlFor="ex-category">Категория</Label>
      <Input
        id="ex-category"
        name="category"
        defaultValue={value?.category}
        required
        minLength={2}
      />
      <Label htmlFor="ex-equipment">Оборудование через запятую</Label>
      <Input
        id="ex-equipment"
        name="equipment"
        defaultValue={value?.equipment.join(", ")}
      />
      <Label htmlFor="ex-metric">Показатель</Label>
      <select
        id="ex-metric"
        className="form-select"
        name="metricType"
        defaultValue={value?.metricType ?? "REPS"}
      >
        <option value="REPS">Повторения</option>
        <option value="DURATION">Время, секунды</option>
      </select>
      <Label htmlFor="ex-instructions">Техника выполнения</Label>
      <textarea
        id="ex-instructions"
        className="form-textarea"
        name="instructions"
        required
        minLength={10}
        maxLength={3000}
        rows={5}
        defaultValue={value?.instructions}
      />
      {save.error && <p className="form-error">{save.error.message}</p>}
      <Button disabled={save.isPending}>Сохранить упражнение</Button>
    </form>
  );
}
