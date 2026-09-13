"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { inputToUtc } from "@/lib/format";
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
import { type Session, localInput, localDay, addDays } from "./types";
interface Resource {
  id: string;
  name: string;
  capacity?: number;
  durationMinutes?: number;
  category?: string;
  specialties?: string[];
  workingHours?: unknown;
}
export function SessionEditor({
  session,
  proposal,
  onClose,
}: {
  session?: Session;
  proposal?: { startAt: string; endAt: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [series, setSeries] = useState(false),
    [preview, setPreview] = useState<{
      body: unknown;
      count: number;
      bookings?: { id: string; client: { name: string } }[];
    } | null>(null),
    [key] = useState(() => crypto.randomUUID());
  const { data: r, error } = useQuery({
    queryKey: ["schedule-resources"],
    queryFn: async () => {
      const kinds = ["workouts", "trainers", "halls"];
      const values = await Promise.all(
        kinds.map((k) =>
          api<{ items: Resource[] }>("/catalog/" + k + "?limit=100"),
        ),
      );
      return Object.fromEntries(
        kinds.map((k, i) => [k, values[i]?.items ?? []]),
      );
    },
  });
  const check = useMutation({
    mutationFn: async (body: unknown) => {
      const result = await post<{
        count: number;
        bookings?: { id: string; client: { name: string } }[];
      }>(
        session
          ? "/schedule/" + session.id + "/preview"
          : series
            ? "/schedule/series/preview"
            : "/schedule/preview",
        body,
      );
      return { body, count: result.count, bookings: result.bookings };
    },
    onSuccess: setPreview,
  });
  const save = useMutation({
    mutationFn: () =>
      post(
        session
          ? "/schedule/" + session.id + "/edit"
          : series
            ? "/schedule/series"
            : "/schedule",
        preview?.body,
        key,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success("Расписание обновлено");
      onClose();
    },
  });
  const start =
      proposal?.startAt ??
      session?.startAt ??
      inputToUtc(addDays(localDay(), 1) + "T10:00"),
    end =
      proposal?.endAt ??
      session?.endAt ??
      new Date(new Date(start).getTime() + 3600000).toISOString();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="editor-dialog">
        <DialogHeader>
          <DialogTitle>
            {session ? "Изменить занятие" : "Новое занятие"}
          </DialogTitle>
          <DialogDescription>
            Время по Москве. Перед сохранением проверим ресурсы и связанные
            записи.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="form-error">{error.message}</p>}
        {!r && !error && (
          <p role="status">Загружаем направления, тренеров и залы…</p>
        )}
        {r && (
          <form
            onChange={() => setPreview(null)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                base = {
                  workoutId: f.get("workoutId"),
                  trainerId: f.get("trainerId"),
                  hallId: f.get("hallId"),
                  capacity: Number(f.get("capacity")),
                  status: f.get("status"),
                };
              const data = series
                ? {
                    ...base,
                    startDate: f.get("startDate"),
                    endDate: f.get("endDate"),
                    startTime: f.get("startTime"),
                    durationMinutes: Number(f.get("durationMinutes")),
                    weekdays: f.getAll("weekdays").map(Number),
                    excludedDates: String(f.get("excludedDates") ?? "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }
                : {
                    ...base,
                    startAt: inputToUtc(String(f.get("startAt"))),
                    endAt: inputToUtc(String(f.get("endAt"))),
                  };
              check.mutate(
                session
                  ? {
                      version: session.version,
                      scope: f.get("scope") ?? "ONE",
                      data,
                      reason: f.get("reason"),
                    }
                  : data,
              );
            }}
          >
            <div className="editor-grid">
              {[
                ["workouts", "workoutId", "Направление"],
                ["trainers", "trainerId", "Тренер"],
                ["halls", "hallId", "Зал"],
              ].map(([kind, name, label]) => (
                <div className="field" key={name}>
                  <Label htmlFor={name}>{label}</Label>
                  <select
                    className="form-select"
                    id={name}
                    name={name}
                    required
                    defaultValue={
                      session?.[name as "workoutId" | "trainerId" | "hallId"] ??
                      ""
                    }
                  >
                    <option value="" disabled>
                      Выберите
                    </option>
                    {r?.[kind!]?.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {kind === "halls" ? " · " + i.capacity + " мест" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="field">
                <Label htmlFor="capacity">Вместимость занятия</Label>
                <Input
                  type="number"
                  name="capacity"
                  id="capacity"
                  min={1}
                  max={500}
                  required
                  defaultValue={session?.capacity ?? 12}
                />
              </div>
              <div className="field">
                <Label htmlFor="status">Статус</Label>
                <select
                  className="form-select"
                  name="status"
                  id="status"
                  defaultValue={
                    session?.status === "DRAFT" ? "DRAFT" : "PUBLISHED"
                  }
                >
                  <option value="PUBLISHED">Опубликовано</option>
                  {(!session || session.status === "DRAFT") && (
                    <option value="DRAFT">Черновик</option>
                  )}
                </select>
              </div>
              {!session && (
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={series}
                    onChange={(e) => setSeries(e.target.checked)}
                  />
                  Повторять еженедельно
                </label>
              )}
              {series ? (
                <>
                  <div className="field">
                    <Label htmlFor="startDate">Первый день серии</Label>
                    <Input
                      id="startDate"
                      name="startDate"
                      type="date"
                      required
                      defaultValue={addDays(localDay(), 1)}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="endDate">Последний день серии</Label>
                    <Input
                      id="endDate"
                      name="endDate"
                      type="date"
                      required
                      defaultValue={addDays(localDay(), 28)}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="startTime">Время начала</Label>
                    <Input
                      id="startTime"
                      name="startTime"
                      type="time"
                      required
                      defaultValue="10:00"
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="durationMinutes">Длительность, минут</Label>
                    <Input
                      id="durationMinutes"
                      name="durationMinutes"
                      type="number"
                      min={15}
                      max={240}
                      required
                      defaultValue={60}
                    />
                  </div>
                  <fieldset className="span-2 plan-rule">
                    <legend>Дни недели</legend>
                    <div className="button-row">
                      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                        <label className="inline-check" key={day}>
                          <input
                            type="checkbox"
                            name="weekdays"
                            value={day}
                            defaultChecked={[1, 3, 5].includes(day)}
                          />
                          {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][day]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field span-2">
                    <Label htmlFor="excludedDates">
                      Пропустить даты (ГГГГ-ММ-ДД через запятую)
                    </Label>
                    <Input id="excludedDates" name="excludedDates" />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <Label htmlFor="startAt">Начало</Label>
                    <Input
                      id="startAt"
                      name="startAt"
                      type="datetime-local"
                      required
                      defaultValue={localInput(start)}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="endAt">Окончание</Label>
                    <Input
                      id="endAt"
                      name="endAt"
                      type="datetime-local"
                      required
                      defaultValue={localInput(end)}
                    />
                  </div>
                </>
              )}
              {session && (
                <>
                  <div className="field">
                    <Label htmlFor="scope">Область изменения</Label>
                    <select className="form-select" id="scope" name="scope">
                      <option value="ONE">Только это занятие</option>
                      {session.seriesId && (
                        <option value="FUTURE">
                          Это и будущие занятия серии
                        </option>
                      )}
                    </select>
                  </div>
                  <div className="field">
                    <Label htmlFor="reason">Причина изменения</Label>
                    <Input
                      id="reason"
                      name="reason"
                      required
                      minLength={3}
                      defaultValue={proposal ? "Перенос в календаре" : ""}
                    />
                  </div>
                </>
              )}
            </div>
            {(check.error || save.error) && (
              <p className="form-error" role="alert">
                {check.error?.message ?? save.error?.message}
              </p>
            )}
            {preview && (
              <div className="notice">
                Пересечений не найдено. Будет сохранено занятий: {preview.count}
                {!!preview.bookings?.length && (
                  <>
                    <p>Изменение затронет записи:</p>
                    <ul className="impact-list">
                      {preview.bookings.map((b) => (
                        <li key={b.id}>{b.client.name}</li>
                      ))}
                    </ul>
                  </>
                )}
                .
              </div>
            )}
            <div className="form-actions">
              <Button
                variant="outline"
                type="submit"
                disabled={check.isPending}
              >
                {check.isPending ? "Проверяем…" : "Проверить изменения"}
              </Button>
              <Button
                type="button"
                disabled={!preview || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
