"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateTime, inputToUtc } from "@/lib/format";
import { CancelPeriod } from "./cancel-period";
export function TrainerPeople() {
  const { data, error } = useQuery({
    queryKey: ["trainer-clients"],
    queryFn: () =>
      api<Array<{ id: string; name: string; status: string }>>(
        "/trainer/clients",
      ),
  });
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ВАША КОМАНДА</span>
        <h1>Мои клиенты</h1>
        <p>Клиенты, с которыми вы работаете индивидуально.</p>
      </div>
      {error ? (
        <p className="form-error">{error.message}</p>
      ) : (
        <div className="surface">
          {data?.length ? (
            data.map((c) => (
              <div className="detail-list" key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {c.status === "ACTIVE" ? "Активен" : "Неактивен"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Назначенных клиентов пока нет.</p>
          )}
        </div>
      )}
    </>
  );
}
export function TrainerAvailability() {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["trainer-availability"],
    queryFn: () =>
      api<{
        workingHours: Array<{ day: number; start: number; end: number }>;
        absences: Array<{
          id: string;
          startAt: string;
          endAt: string;
          reason: string;
          cancelledAt?: string | null;
        }>;
      }>("/trainer/availability"),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) => post("/trainer/availability", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["trainer-availability"] });
      toast.success("Период сохранён");
    },
  });
  const time = (minutes: number) =>
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    ":" +
    String(minutes % 60).padStart(2, "0");
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ВАШ ГРАФИК</span>
        <h1>Доступность</h1>
        <p>
          Укажите отпуск или другой перерыв. Пересечения с занятиями проверит
          система.
        </p>
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div className="detail-grid">
        <section className="surface">
          <h2>Рабочие часы</h2>
          {data?.workingHours.length ? (
            data.workingHours.map((h, i) => (
              <div className="detail-list" key={i}>
                <div>
                  <span>
                    {
                      [
                        "Воскресенье",
                        "Понедельник",
                        "Вторник",
                        "Среда",
                        "Четверг",
                        "Пятница",
                        "Суббота",
                      ][h.day]
                    }
                  </span>
                  <strong>
                    {time(h.start)} — {time(h.end)}
                  </strong>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Рабочие часы настроит администратор.</p>
          )}
          <h2 className="mt-8">Перерывы</h2>
          {data?.absences.map((a) => (
            <article className="timeline" key={a.id}>
              <p>
                {dateTime(a.startAt)} — {dateTime(a.endAt)}
              </p>
              <span className="muted">{a.reason}</span>
              {a.cancelledAt ? (
                <span className="status-pill">Отменён</span>
              ) : (
                <CancelPeriod path={`/trainer/availability/${a.id}/cancel`} />
              )}
            </article>
          ))}
        </section>
        <section className="surface">
          <h2>Добавить период</h2>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              mutation.mutate(
                {
                  startAt: inputToUtc(String(fd.get("startAt"))),
                  endAt: inputToUtc(String(fd.get("endAt"))),
                  reason: fd.get("reason"),
                },
                { onSuccess: () => form.reset() },
              );
            }}
          >
            <Label htmlFor="startAt">Начало</Label>
            <Input id="startAt" name="startAt" type="datetime-local" required />
            <Label htmlFor="endAt">Окончание</Label>
            <Input id="endAt" name="endAt" type="datetime-local" required />
            <Label htmlFor="reason">Причина</Label>
            <Input id="reason" name="reason" minLength={3} required />
            {mutation.error && (
              <p className="form-error">{mutation.error.message}</p>
            )}
            <Button disabled={mutation.isPending}>Сохранить период</Button>
          </form>
        </section>
      </div>
    </>
  );
}
