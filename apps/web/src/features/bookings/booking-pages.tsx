"use client";

import { SelectField } from "@/components/ui/select-field";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, ArrowLeft, Check, UserX } from "lucide-react";
import { api, post, type User } from "@/lib/api";
import { dateTime, dateOnly } from "@/lib/format";
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
import { bookingStatuses, type Booking } from "./types";
export function BookingList({
  area,
  sessionId: providedSession,
}: {
  area: "account" | "admin" | "trainer";
  sessionId?: string;
}) {
  const { params, set } = useUrlState(),
    sessionId = providedSession ?? params.get("sessionId") ?? undefined,
    page = Number(params.get("page") ?? 1),
    status = params.get("status") ?? "",
    upcoming = params.get("upcoming") ?? (sessionId ? "false" : "true"),
    q = params.get("q") ?? "",
    clientId = params.get("clientId") ?? "";
  const { data, error } = useQuery({
    queryKey: [
      "bookings",
      area,
      page,
      status,
      upcoming,
      q,
      sessionId,
      clientId,
    ],
    queryFn: () =>
      api<{ items: Booking[]; total: number }>(
        "/bookings?area=" +
          area +
          "&page=" +
          page +
          "&q=" +
          encodeURIComponent(q) +
          "&upcoming=" +
          upcoming +
          (status ? "&status=" + status : "") +
          (sessionId ? "&sessionId=" + sessionId : "") +
          (clientId ? "&clientId=" + clientId : ""),
      ),
    refetchInterval: 10000,
  });
  return (
    <>
      {!sessionId && (
        <div className="page-heading heading-actions">
          <div>
            <span className="eyebrow">
              {area === "account" ? "ВАШЕ ДВИЖЕНИЕ" : "ЖУРНАЛ КЛУБА"}
            </span>
            <h1>
              {area === "trainer" ? "Участники занятий" : "Записи на занятия"}
            </h1>
            <p>Расписание, очередь и история посещений.</p>
          </div>
          <Button asChild>
            <Link
              href={area === "account" ? "/schedule" : "/" + area + "/schedule"}
            >
              <CalendarDays size={17} />
              Расписание
            </Link>
          </Button>
        </div>
      )}
      <div className="toolbar">
        {area !== "account" && (
          <Input
            aria-label="Поиск участника"
            placeholder="Имя участника"
            value={q}
            onChange={(e) => {
              set("q", e.target.value);
              set("page", "1");
            }}
          />
        )}
        <SelectField
          className="form-select"
          aria-label="Статус записи"
          value={status}
          onChange={(e) => {
            set("status", e.target.value);
            set("page", "1");
          }}
        >
          <option value="">Все статусы</option>
          {Object.entries(bookingStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          className="form-select"
          aria-label="Период записей"
          value={upcoming}
          onChange={(e) => {
            set("upcoming", e.target.value);
            set("page", "1");
          }}
        >
          <option value="true">Предстоящие</option>
          <option value="false">Вся история</option>
        </SelectField>
      </div>
      {error ? (
        <p className="form-error">{error.message}</p>
      ) : !data ? (
        <p role="status">Загружаем записи…</p>
      ) : (
        <>
          <div className="booking-list">
            {data.items.map((b) => (
              <article className="booking-row" key={b.id}>
                <div className="booking-date">
                  <strong>{dateOnly(b.session.startAt)}</strong>
                  <span>{dateTime(b.session.startAt)}</span>
                </div>
                <div className="booking-description">
                  <Link
                    className="table-link"
                    href={"/" + area + "/bookings/" + b.id}
                  >
                    {b.session.workout.name}
                  </Link>
                  <p>
                    {area === "account"
                      ? b.session.trainer.user.name
                      : b.client.name}{" "}
                    · {b.session.hall.name}
                  </p>
                </div>
                <span className="status-pill">{bookingStatuses[b.status]}</span>
                <Button asChild variant="ghost">
                  <Link href={"/" + area + "/bookings/" + b.id}>Открыть </Link>
                </Button>
              </article>
            ))}
          </div>
          {!data.items.length && (
            <div className="surface empty-state">
              <h2>Здесь пока нет записей</h2>
              <p>Выберите занятие в расписании или измените фильтры.</p>
            </div>
          )}
          <div className="pagination">
            <span>Всего: {data.total}</span>
            <Button
              variant="ghost"
              disabled={page <= 1}
              onClick={() => set("page", String(page - 1))}
            >
              Назад
            </Button>
            <Button
              variant="ghost"
              disabled={page * 20 >= data.total}
              onClick={() => set("page", String(page + 1))}
            >
              Далее
            </Button>
          </div>
        </>
      )}
    </>
  );
}
export function BookingDetail({
  id,
  area,
}: {
  id: string;
  area: "account" | "admin" | "trainer";
}) {
  const qc = useQueryClient(),
    user = qc.getQueryData<User>(["me"]),
    admin = user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r)),
    [action, setAction] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  const { data: b, error } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<Booking>("/bookings/" + id),
    refetchInterval: 10000,
  });
  const { data: preview, error: previewError } = useQuery({
    queryKey: ["cancel-booking-preview", id, b?.version],
    queryFn: () =>
      post<{ version: number; late: boolean; message: string }>(
        "/bookings/" + id + "/cancel-preview",
      ),
    enabled: action === "cancel",
  });
  const save = useMutation({
    mutationFn: (body: unknown) =>
      post(
        "/bookings/" +
          id +
          "/" +
          (action === "cancel"
            ? "cancel"
            : action === "restore"
              ? "restore-visit"
              : "attendance"),
        body,
        key,
      ),
    onSuccess: () => {
      for (const queryKey of [
        ["booking", id],
        ["bookings"],
        ["schedule"],
        ["memberships"],
        ["booking-options"],
      ])
        void qc.invalidateQueries({ queryKey });
      toast.success("Запись обновлена");
      setAction("");
    },
  });
  if (error) return <p className="form-error">{error.message}</p>;
  if (!b) return <p role="status">Загружаем запись…</p>;
  const open = (a: string) => {
    save.reset();
    setKey(crypto.randomUUID());
    setAction(a);
  };
  const future = new Date(b.session.startAt) > new Date();
  return (
    <>
      <Link href={"/" + area + "/bookings"} className="back-link">
        <ArrowLeft size={15} />К записям
      </Link>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">{dateOnly(b.session.startAt)}</span>
          <h1>{b.session.workout.name}</h1>
          <p>
            {dateTime(b.session.startAt)} · {b.session.hall.name}
          </p>
        </div>
        <span className="status-pill">{bookingStatuses[b.status]}</span>
      </div>
      <div className="detail-grid">
        <section className="surface">
          <h2>{b.client.name}</h2>
          <dl className="detail-list">
            <div>
              <dt>Тренер</dt>
              <dd>{b.session.trainer.user.name}</dd>
            </div>
            <div>
              <dt>Абонемент</dt>
              <dd>
                {area === "trainer" ? (
                  b.membership.termsSnapshot.title
                ) : (
                  <Link href={"/" + area + "/memberships/" + b.membershipId}>
                    {b.membership.termsSnapshot.title}
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt>Посещение</dt>
              <dd>
                {b.balanceState === "RESERVED"
                  ? "Зарезервировано"
                  : b.balanceState === "CONSUMED"
                    ? "Списано"
                    : "Не списано"}
              </dd>
            </div>
          </dl>
          {b.reason && <p className="notice">{b.reason}</p>}
          <div className="button-row">
            {future &&
              ["CONFIRMED", "WAITLISTED"].includes(b.status) &&
              area !== "trainer" && (
                <Button variant="outline" onClick={() => open("cancel")}>
                  {b.status === "WAITLISTED"
                    ? "Покинуть очередь"
                    : "Отменить запись"}
                </Button>
              )}
            {area !== "account" &&
              ["CONFIRMED", "ATTENDED", "NO_SHOW"].includes(b.status) && (
                <>
                  <Button onClick={() => open("ATTENDED")}>
                    <Check size={16} />
                    Пришёл
                  </Button>
                  <Button variant="outline" onClick={() => open("NO_SHOW")}>
                    <UserX size={16} />
                    Неявка
                  </Button>
                </>
              )}
            {admin && b.balanceState === "CONSUMED" && (
              <Button variant="ghost" onClick={() => open("restore")}>
                Вернуть посещение
              </Button>
            )}
            {future &&
              [
                "CANCELLED_ON_TIME",
                "CANCELLED_LATE",
                "WAITLIST_SKIPPED",
                "WAITLIST_EXPIRED",
              ].includes(b.status) && (
                <Button asChild>
                  <Link
                    href={
                      (area === "account"
                        ? "/schedule"
                        : "/" + area + "/schedule") +
                      "?session=" +
                      b.sessionId
                    }
                  >
                    Записаться снова
                  </Link>
                </Button>
              )}
          </div>
        </section>
        <section className="surface">
          <h2>История записи</h2>
          {b.events?.map((e) => (
            <article className="timeline" key={e.id}>
              <strong>{bookingStatuses[e.toStatus]}</strong>
              <p>{e.reason}</p>
              <small>{dateTime(e.createdAt)}</small>
            </article>
          ))}
        </section>
      </div>
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "cancel"
                ? "Отмена записи"
                : action === "restore"
                  ? "Вернуть посещение"
                  : action === "ATTENDED"
                    ? "Отметить посещение"
                    : "Отметить неявку"}
            </DialogTitle>
            <DialogDescription>
              {action === "cancel"
                ? (preview?.message ?? "Проверяем условия отмены")
                : action === "restore"
                  ? "Списанное посещение вернётся в остаток. История сохранится."
                  : "Отметка сохраняется в журнале и учитывает одно посещение."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                reason = String(f.get("reason") ?? "").trim();
              save.mutate(
                action === "cancel"
                  ? {
                      version: preview?.version,
                      acceptLoss: f.get("acceptLoss") === "on",
                      ...(reason ? { reason } : {}),
                    }
                  : action === "restore"
                    ? { version: b.version, reason }
                    : {
                        version: b.version,
                        status: action,
                        correction: f.get("correction") === "on",
                        ...(reason ? { reason } : {}),
                      },
              );
            }}
          >
            {action === "cancel" && preview?.late && (
              <label className="inline-check">
                <Input name="acceptLoss" type="checkbox" required />
                {b.membership.termsSnapshot.visitLimit === null
                  ? "Подтверждаю позднюю отмену"
                  : "Подтверждаю списание одного посещения"}
              </label>
            )}
            {admin && ["ATTENDED", "NO_SHOW"].includes(action) && (
              <label className="inline-check">
                <Input type="checkbox" name="correction" />
                Административное исправление отметки
              </label>
            )}
            <Label htmlFor="booking-reason">
              Причина {action === "restore" ? "" : "(при необходимости)"}
            </Label>
            <Input
              id="booking-reason"
              name="reason"
              required={action === "restore"}
              minLength={3}
            />
            {(save.error || previewError) && (
              <p className="form-error">
                {save.error?.message ?? previewError?.message}
              </p>
            )}
            <Button
              disabled={save.isPending || (action === "cancel" && !preview)}
            >
              Подтвердить
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
