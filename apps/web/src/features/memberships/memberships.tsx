"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Snowflake, ArrowLeft, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { api, post, type User } from "@/lib/api";
import { dateOnly, dateTime, money } from "@/lib/format";
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
export interface Membership {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  orderId: string;
  status: string;
  startAt: string;
  endAt: string;
  available: number;
  reserved: number;
  consumed: number;
  termsSnapshot: {
    title: string;
    description: string;
    visitLimit: number | null;
    priceMinor: number;
    durationDays: number;
    freezeQuotaDays: number;
  };
  freezes: {
    id: string;
    startAt: string;
    endAt: string;
    days: number;
    status: string;
  }[];
  ledger: {
    id: string;
    kind: string;
    availableDelta: number;
    reservedDelta: number;
    consumedDelta: number;
    createdAt: string;
    reason: string | null;
  }[];
}
const statuses: Record<string, string> = {
  ACTIVE: "Активен",
  SCHEDULED: "Ожидает начала",
  EXPIRED: "Истёк",
  FROZEN: "Заморожен",
  REFUND_PENDING: "Оформляется возврат",
  EXHAUSTED: "Нет свободных посещений",
  CANCELLED: "Отменён",
};
const kinds: Record<string, string> = {
  ISSUE: "Выдача посещений",
  RESERVE: "Резерв на занятие",
  RELEASE: "Отмена резерва",
  CONSUME: "Посещение списано",
  RESTORE: "Посещение возвращено",
  ADJUST: "Корректировка",
};
export function MembershipList({ area }: { area: "account" | "admin" }) {
  const { params, set } = useUrlState(),
    page = Number(params.get("page")) || 1,
    q = params.get("q") ?? "",
    clientId = params.get("clientId") ?? "";
  const { data, error, isLoading } = useQuery({
    queryKey: ["memberships", area, q, page, clientId],
    queryFn: () =>
      api<{ items: Membership[]; total: number }>(
        "/memberships?" +
          new URLSearchParams({
            q,
            page: String(page),
            area,
            ...(clientId ? { clientId } : {}),
          }),
      ),
  });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">ВАШ РИТМ</span>
          <h1>
            {area === "account" ? "Мои абонементы" : "Абонементы клиентов"}
          </h1>
          <p>Сроки, доступные посещения и история изменений.</p>
        </div>
        {area === "account" && (
          <Button asChild>
            <Link href="/memberships">Выбрать абонемент</Link>
          </Button>
        )}
      </div>
      {area === "admin" && (
        <Input
          className="mb-6 max-w-md"
          aria-label="Поиск клиента"
          placeholder="Поиск по имени клиента"
          value={q}
          onChange={(e) => {
            set("q", e.target.value);
            set("page", "1");
          }}
        />
      )}
      {error && <p className="form-error">{error.message}</p>}
      {isLoading ? (
        <p role="status">Загружаем абонементы…</p>
      ) : data?.items.length ? (
        <div className="plan-grid">
          {data.items.map((m) => (
            <Link
              className="membership-card"
              key={m.id}
              href={"/" + area + "/memberships/" + m.id}
            >
              <div className="heading-actions">
                <span className="status-pill">{statuses[m.status]}</span>
              </div>
              <h2>{m.termsSnapshot.title}</h2>
              {area === "admin" && <p className="muted">{m.client.name}</p>}
              <div className="credit-large">
                {m.termsSnapshot.visitLimit === null ? "∞" : m.available}
                <small>
                  {m.termsSnapshot.visitLimit === null
                    ? "безлимит"
                    : "посещений доступно"}
                </small>
              </div>
              <div className="membership-meta">
                <span>
                  <Clock3 size={15} />
                  До {dateOnly(m.endAt)}
                </span>
                <span>В резерве: {m.reserved}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <Clock3 />
          </div>
          <h2>Абонементов пока нет</h2>
          <p>
            {area === "account"
              ? "Выберите подходящий ритм занятий — и начните с первой тренировки."
              : "Здесь появятся абонементы после оформления покупки."}
          </p>
        </div>
      )}
      {!!data && data.total > 20 && (
        <div className="table-pagination">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => set("page", String(page - 1))}
          >
            Назад
          </Button>
          <span>
            {page} / {Math.ceil(data.total / 20)}
          </span>
          <Button
            variant="outline"
            disabled={page * 20 >= data.total}
            onClick={() => set("page", String(page + 1))}
          >
            Далее
          </Button>
        </div>
      )}
    </>
  );
}
export function MembershipDetail({
  id,
  area,
}: {
  id: string;
  area: "account" | "admin";
}) {
  const qc = useQueryClient(),
    user = qc.getQueryData<User>(["me"]),
    admin = user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const [action, setAction] = useState(""),
    [freezeId, setFreezeId] = useState(""),
    [key, setKey] = useState("");
  const { data: m, error } = useQuery({
    queryKey: ["memberships", id],
    queryFn: () => api<Membership>("/memberships/" + id),
  });
  const open = (value: string, id = "") => {
    setKey(crypto.randomUUID());
    setAction(value);
    setFreezeId(id);
  };
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      action === "change"
        ? api("/memberships/" + id + "/freezes/" + freezeId, {
            method: "PATCH",
            body: JSON.stringify(body),
            headers: { "Idempotency-Key": key },
          })
        : post(
            "/memberships/" +
              id +
              "/" +
              (action === "adjust" ? "adjustments" : "freezes"),
            body,
            key,
          ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memberships"] });
      setAction("");
      toast.success("Абонемент обновлён");
    },
  });
  if (error) return <p className="form-error">{error.message}</p>;
  if (!m) return <p role="status">Загрузка абонемента…</p>;
  const used = m.freezes
    .filter((f) => f.status === "ACTIVE")
    .reduce((n, f) => n + f.days, 0);
  return (
    <>
      <Link className="back-link" href={"/" + area + "/memberships"}>
        <ArrowLeft size={15} />
        Все абонементы
      </Link>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">
            {statuses[m.status]} · {m.client.name}
          </span>
          <h1>{m.termsSnapshot.title}</h1>
          <p>
            {dateOnly(m.startAt)} — {dateOnly(m.endAt)}
          </p>
        </div>
        <div className="button-row">
          {!["EXPIRED", "CANCELLED"].includes(m.status) &&
            m.termsSnapshot.freezeQuotaDays > used && (
              <Button variant="outline" onClick={() => open("freeze")}>
                <Snowflake size={17} />
                Заморозить
              </Button>
            )}
          {admin && (
            <Button variant="ghost" onClick={() => open("adjust")}>
              Корректировка
            </Button>
          )}
        </div>
      </div>
      <div className="balance-strip">
        <div>
          <strong>
            {m.termsSnapshot.visitLimit === null ? "∞" : m.available}
          </strong>
          <span>Доступно посещений</span>
        </div>
        <div>
          <strong>{m.reserved}</strong>
          <span>Зарезервировано</span>
        </div>
        <div>
          <strong>{m.consumed}</strong>
          <span>Использовано</span>
        </div>
        <div>
          <strong>{m.termsSnapshot.freezeQuotaDays - used}</strong>
          <span>Дней заморозки осталось</span>
        </div>
      </div>
      <div className="detail-grid">
        <section className="surface">
          <h2>Условия вашего абонемента</h2>
          <p className="muted">{m.termsSnapshot.description}</p>
          <dl className="detail-list">
            <div>
              <dt>Стоимость покупки</dt>
              <dd>{money(m.termsSnapshot.priceMinor)}</dd>
            </div>
            <div>
              <dt>Основной срок</dt>
              <dd>{m.termsSnapshot.durationDays} дней</dd>
            </div>
            <div>
              <dt>Посещения</dt>
              <dd>{m.termsSnapshot.visitLimit ?? "Без ограничений"}</dd>
            </div>
          </dl>
          <h2 className="mt-8">Заморозки</h2>
          {m.freezes.length ? (
            m.freezes.map((f) => (
              <article className="timeline" key={f.id}>
                <p>
                  {dateOnly(f.startAt)} — {dateOnly(f.endAt)}{" "}
                  <small>(дата окончания не включена)</small>
                </p>
                <p className="muted">
                  {f.status === "CANCELLED" ? "Отменена" : f.days + " дней"}
                </p>
                {f.status === "ACTIVE" && new Date(f.endAt) > new Date() && (
                  <Button variant="ghost" onClick={() => open("change", f.id)}>
                    Изменить период
                  </Button>
                )}
              </article>
            ))
          ) : (
            <p className="muted">Заморозок пока нет.</p>
          )}
        </section>
        <section className="surface">
          <h2>История посещений</h2>
          {m.ledger.map((event) => (
            <article className="ledger-row" key={event.id}>
              <div>
                <strong>{kinds[event.kind] ?? event.kind}</strong>
                <small>{dateTime(event.createdAt)}</small>
                {event.reason && <p className="muted">{event.reason}</p>}
              </div>
              <span>
                {event.availableDelta > 0 ? "+" : ""}
                {event.availableDelta} <small>доступно</small>
                {event.reservedDelta !== 0 && (
                  <small>
                    Резерв: {event.reservedDelta > 0 ? "+" : ""}
                    {event.reservedDelta}
                  </small>
                )}
              </span>
            </article>
          ))}
        </section>
      </div>
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "freeze"
                ? "Заморозить абонемент"
                : action === "change"
                  ? "Изменить заморозку"
                  : "Корректировка посещений"}
            </DialogTitle>
            <DialogDescription>
              {action === "freeze"
                ? "Срок абонемента продлится на число дней заморозки. Дата окончания периода не включена."
                : action === "change"
                  ? "Пустая дата отменяет будущую заморозку. Для начавшейся укажите новую дату окончания."
                  : "Изменение сохранится отдельной записью с причиной."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const reason = String(f.get("reason") ?? "");
              mutation.mutate(
                action === "adjust"
                  ? { delta: Number(f.get("delta")), reason }
                  : action === "freeze"
                    ? {
                        startDate: f.get("startDate"),
                        endDate: f.get("endDate"),
                        ...(reason ? { reason } : {}),
                      }
                    : {
                        ...(f.get("endDate")
                          ? { endDate: f.get("endDate") }
                          : {}),
                        reason,
                      },
              );
            }}
          >
            {action === "adjust" ? (
              <>
                <Label htmlFor="delta">Изменение (например, +1 или −1)</Label>
                <Input
                  id="delta"
                  name="delta"
                  type="number"
                  min={-100}
                  max={100}
                  required
                  defaultValue={1}
                />
              </>
            ) : (
              <>
                {action === "freeze" && (
                  <>
                    <Label htmlFor="startDate">Первый день заморозки</Label>
                    <Input
                      id="startDate"
                      name="startDate"
                      type="date"
                      required
                    />
                  </>
                )}
                <Label htmlFor="endDate">Первый день после заморозки</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  required={action === "freeze"}
                />
              </>
            )}
            <Label htmlFor="reason">
              Причина{action === "freeze" ? " (необязательно)" : ""}
            </Label>
            <Input
              id="reason"
              name="reason"
              required={action !== "freeze"}
              minLength={3}
            />
            {mutation.error && (
              <p className="form-error" role="alert">
                {mutation.error.message}
              </p>
            )}
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? "Сохраняем…" : "Подтвердить"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
