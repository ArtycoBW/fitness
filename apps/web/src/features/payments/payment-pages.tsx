"use client";

import { SelectField } from "@/components/ui/select-field";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { api, post, type User } from "@/lib/api";
import { money, dateTime } from "@/lib/format";
import { localDay } from "@/features/schedule/types";
import { useUrlState } from "@/lib/url-state";
import type { Plan } from "@/features/memberships/plans";
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
import { methods, statuses, type Payment } from "./types";
export function PaymentList({ area }: { area: "admin" | "account" }) {
  const { params, set } = useUrlState(),
    q = params.get("q") ?? "",
    page = Number(params.get("page") ?? 1),
    clientId = params.get("clientId") ?? "",
    selling = params.get("sale") === "true",
    setSelling = (v: boolean) => set("sale", v ? "true" : "");
  const { data, error } = useQuery({
    queryKey: ["payments", area, q, page, clientId],
    queryFn: () =>
      api<{ items: Payment[]; total: number }>(
        "/payments?area=" +
          area +
          "&q=" +
          encodeURIComponent(q) +
          "&page=" +
          page +
          (clientId ? "&clientId=" + clientId : ""),
      ),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">
            {area === "admin" ? "ФИНАНСЫ КЛУБА" : "ИСТОРИЯ ПОКУПОК"}
          </span>
          <h1>Оплаты</h1>
          <p>Поступления, подтверждения и возвраты.</p>
        </div>
        {area === "admin" ? (
          <Button onClick={() => setSelling(true)}>
            <Plus size={17} />
            Оформить продажу
          </Button>
        ) : (
          <Button asChild>
            <Link href="/memberships">Выбрать абонемент</Link>
          </Button>
        )}
      </div>
      {area === "admin" && (
        <div className="toolbar">
          <div className="search-field">
            <Search size={17} />
            <Input
              aria-label="Найти оплату по клиенту"
              value={q}
              placeholder="Имя клиента"
              onChange={(e) => {
                set("q", e.target.value);
                set("page", "1");
              }}
            />
          </div>
        </div>
      )}
      {error ? (
        <p className="form-error">{error.message}</p>
      ) : !data ? (
        <p role="status">Загружаем оплаты…</p>
      ) : (
        <section className="surface table-surface">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Покупка</th>
                  {area === "admin" && <th>Клиент</th>}
                  <th>Дата</th>
                  <th>Способ</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        className="table-link"
                        href={"/" + area + "/payments/" + p.id}
                      >
                        {p.title}
                      </Link>
                    </td>
                    {area === "admin" && <td>{p.client?.name}</td>}
                    <td>{dateTime(p.createdAt)}</td>
                    <td>{methods[p.method]}</td>
                    <td>
                      {money(p.amountMinor)}
                      {!!p.refundedMinor && (
                        <small className="block muted">
                          Возвращено {money(p.refundedMinor)}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="status-pill">{statuses[p.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <div className="empty-state">
              <h2>Оплат пока нет</h2>
              <p>Здесь появится история покупок и подтверждения.</p>
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
        </section>
      )}
      {selling && (
        <ManualSale
          clientId={clientId}
          onClose={() => {
            setSelling(false);
            set("sale", "");
          }}
        />
      )}
    </>
  );
}
function ManualSale({
  onClose,
  clientId,
}: {
  onClose: () => void;
  clientId?: string;
}) {
  const qc = useQueryClient(),
    [key] = useState(() => crypto.randomUUID()),
    [q, setQ] = useState("");
  const [selectedClient, setSelectedClient] = useState(clientId ?? "");
  const initialClient = useQuery({
    queryKey: ["catalog", "clients", clientId],
    queryFn: () =>
      api<{ id: string; name: string }>("/catalog/clients/" + clientId),
    enabled: !!clientId,
  });
  const { data: clients } = useQuery({
      queryKey: ["sale-clients", q],
      queryFn: () =>
        api<{ items: { id: string; name: string }[] }>(
          "/catalog/clients?limit=100&q=" + encodeURIComponent(q),
        ),
    }),
    { data: plans } = useQuery({
      queryKey: ["plans"],
      queryFn: () => api<Plan[]>("/membership-plans"),
    });
  const save = useMutation({
    mutationFn: async (body: {
      clientId: string;
      planVersionId: string;
      activationDate: string;
      method: string;
      reason: string;
    }) => {
      const { method, reason, ...order } = body;
      const o = await post<{ id: string }>("/orders", order, key);
      return post(
        "/orders/" + o.id + "/manual-payment",
        { method, reason },
        key,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["memberships"] });
      toast.success("Оплата зарегистрирована, абонемент оформлен");
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Продажа абонемента</DialogTitle>
          <DialogDescription>
            Вы подтверждаете получение оплаты на рецепции.
          </DialogDescription>
        </DialogHeader>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              clientId: String(f.get("clientId")),
              planVersionId: String(f.get("planVersionId")),
              activationDate: String(f.get("activationDate")),
              method: String(f.get("method")),
              reason: String(f.get("reason")),
            });
          }}
        >
          <Label htmlFor="sale-search">Поиск клиента</Label>
          <Input
            id="sale-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Имя клиента"
          />
          <Label htmlFor="sale-client">Клиент</Label>
          <SelectField
            className="form-select"
            id="sale-client"
            name="clientId"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            required
          >
            <option value="">Выберите клиента</option>
            {initialClient.data &&
              !clients?.items.some((c) => c.id === initialClient.data.id) && (
                <option value={initialClient.data.id}>
                  {initialClient.data.name}
                </option>
              )}
            {clients?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Label htmlFor="sale-plan">Абонемент</Label>
          <SelectField
            className="form-select"
            id="sale-plan"
            name="planVersionId"
            required
          >
            <option value="">Выберите тариф</option>
            {plans
              ?.filter((p) => !p.archivedAt)
              .map((p) => (
                <option key={p.id} value={p.versions[0]?.id}>
                  {p.name} · {money(p.versions[0]?.priceMinor ?? 0)}
                </option>
              ))}
          </SelectField>
          <Label htmlFor="sale-date">Дата активации</Label>
          <Input
            type="date"
            name="activationDate"
            id="sale-date"
            required
            defaultValue={localDay()}
          />
          <Label htmlFor="sale-method">Способ оплаты</Label>
          <SelectField className="form-select" name="method" id="sale-method">
            <option value="CASH">Наличные</option>
            <option value="TERMINAL">Терминал</option>
          </SelectField>
          <Label htmlFor="sale-reason">Основание регистрации</Label>
          <Input
            name="reason"
            id="sale-reason"
            required
            minLength={3}
            placeholder="Оплата получена на рецепции"
          />
          {save.error && <p className="form-error">{save.error.message}</p>}
          <Button disabled={save.isPending}>
            Подтвердить получение оплаты
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function PaymentDetail({
  area,
  id,
}: {
  area: "admin" | "account";
  id: string;
}) {
  const qc = useQueryClient(),
    user = qc.getQueryData<User>(["me"]),
    admin = user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r)),
    [refunding, setRefunding] = useState(false);
  const { data: p, error } = useQuery({
    queryKey: ["payment", id],
    queryFn: () => api<Payment>("/payments/" + id),
    refetchInterval: (q) =>
      q.state.data?.refunds?.some((r) =>
        ["PROCESSING", "UNKNOWN"].includes(r.status),
      ) || ["PROCESSING", "UNKNOWN"].includes(q.state.data?.status ?? "")
        ? 1500
        : false,
  });
  if (error) return <p className="form-error">{error.message}</p>;
  if (!p) return <p role="status">Загружаем операцию…</p>;
  return (
    <>
      <Link href={"/" + area + "/payments"} className="back-link">
        <ArrowLeft size={15} />К оплатам
      </Link>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">ПОДРОБНОСТИ ОПЕРАЦИИ</span>
          <h1>{p.title}</h1>
          <p>{p.client?.name}</p>
        </div>
        <span className="status-pill">{statuses[p.status]}</span>
      </div>
      <div className="detail-grid">
        <section className="surface">
          <h2>{money(p.amountMinor)}</h2>
          <dl className="detail-list">
            <div>
              <dt>Дата</dt>
              <dd>{dateTime(p.createdAt)}</dd>
            </div>
            <div>
              <dt>Способ</dt>
              <dd>
                {methods[p.method]}{" "}
                {p.maskedLast4 ? "•••• " + p.maskedLast4 : ""}
              </dd>
            </div>
            <div>
              <dt>Номер операции</dt>
              <dd className="break-all">{p.id}</dd>
            </div>
          </dl>
          <div className="button-row">
            {p.confirmation && (
              <Button asChild>
                <Link href={"/payments/" + id + "/confirmation"}>
                  Подтверждение
                </Link>
              </Button>
            )}
            {p.status === "FAILED" && (
              <Button asChild>
                <Link href={"/checkout/" + p.orderId}>Повторить оплату</Link>
              </Button>
            )}
            {p.membership && (
              <Button variant="outline" asChild>
                <Link href={"/" + area + "/memberships/" + p.membership.id}>
                  Абонемент
                </Link>
              </Button>
            )}
            {admin && p.status === "SUCCEEDED" && (
              <Button variant="ghost" onClick={() => setRefunding(true)}>
                Оформить возврат
              </Button>
            )}
          </div>
        </section>
        <section className="surface">
          <h2>Возвраты</h2>
          {!p.refunds?.length && (
            <p className="muted">Возвратов по этой операции нет.</p>
          )}
          {p.refunds?.map((r) => (
            <article className="timeline" key={r.id}>
              <strong>
                {money(r.amountMinor)} ·{" "}
                {r.status === "SUCCEEDED"
                  ? "Возвращено"
                  : r.status === "FAILED"
                    ? "Не удалось вернуть"
                    : r.status === "UNKNOWN"
                      ? "Проверяем статус"
                      : "Обрабатывается"}
              </strong>
              <p>{r.reason}</p>
              <small>
                {dateTime(r.createdAt)} ·{" "}
                {r.entitlementAction === "CANCEL"
                  ? "Прекращение абонемента"
                  : "Сохранение абонемента"}
              </small>
            </article>
          ))}
        </section>
      </div>
      {refunding && (
        <RefundDialog payment={p} onClose={() => setRefunding(false)} />
      )}
    </>
  );
}
function RefundDialog({
  payment: p,
  onClose,
}: {
  payment: Payment;
  onClose: () => void;
}) {
  const qc = useQueryClient(),
    [key] = useState(() => crypto.randomUUID()),
    [preview, setPreview] = useState<{
      amountMinor: number;
      entitlementAction: string;
      membershipVersion: number;
      message: string;
      consumed: number;
      reserved: number;
      bookings?: {
        id: string;
        session: { startAt: string; workout: { name: string } };
      }[];
      reason: string;
    } | null>(null);
  const check = useMutation({
    mutationFn: async (body: {
      amountMinor: number;
      entitlementAction: string;
      reason: string;
    }) => ({
      ...(await post<Omit<NonNullable<typeof preview>, "reason">>(
        "/payments/" + p.id + "/refund-preview",
        body,
      )),
      reason: body.reason,
    }),
    onSuccess: setPreview,
  });
  const save = useMutation({
    mutationFn: () =>
      post(
        "/payments/" + p.id + "/refunds",
        {
          amountMinor: preview?.amountMinor,
          entitlementAction: preview?.entitlementAction,
          reason: preview?.reason,
          membershipVersion: preview?.membershipVersion,
        },
        key,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payment", p.id] });
      void qc.invalidateQueries({ queryKey: ["memberships"] });
      toast.success("Возврат оформлен");
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Возврат оплаты</DialogTitle>
          <DialogDescription>
            Проверьте сумму и права клиента до подтверждения.
          </DialogDescription>
        </DialogHeader>
        <form
          className="form-stack"
          onChange={() => setPreview(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            check.mutate({
              amountMinor: Math.round(Number(f.get("amount")) * 100),
              entitlementAction: String(f.get("action")),
              reason: String(f.get("reason")),
            });
          }}
        >
          <Label htmlFor="refund-amount">Сумма, ₽</Label>
          <Input
            id="refund-amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={
              (p.amountMinor -
                (p.refunds ?? [])
                  .filter((r) => r.status !== "FAILED")
                  .reduce((s, r) => s + r.amountMinor, 0)) /
              100
            }
          />
          <Label htmlFor="refund-action">После частичного возврата</Label>
          <SelectField name="action" id="refund-action" className="form-select">
            <option value="KEEP">Сохранить абонемент</option>
            <option value="CANCEL">Прекратить абонемент</option>
          </SelectField>
          <Label htmlFor="refund-reason">Причина</Label>
          <Input name="reason" id="refund-reason" required minLength={3} />
          {preview && (
            <div className="notice">
              <strong>{money(preview.amountMinor)} к возврату</strong>
              <p>{preview.message}</p>
              <p>
                Посещений использовано: {preview.consumed}, зарезервировано:{" "}
                {preview.reserved}.
              </p>
              {!!preview.bookings?.length && (
                <>
                  <p>Будут отменены записи:</p>
                  <ul className="impact-list">
                    {preview.bookings.map((b) => (
                      <li key={b.id}>
                        {b.session.workout.name} · {dateTime(b.session.startAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {(check.error || save.error) && (
            <p className="form-error">
              {check.error?.message ?? save.error?.message}
            </p>
          )}
          <div className="button-row">
            <Button variant="outline" disabled={check.isPending}>
              Рассчитать последствия
            </Button>
            <Button
              type="button"
              disabled={!preview || save.isPending}
              onClick={() => save.mutate()}
            >
              Подтвердить возврат
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
