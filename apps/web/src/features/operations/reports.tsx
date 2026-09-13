"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post, type User } from "@/lib/api";
import { money, dateTime } from "@/lib/format";
import { localDay, addDays } from "@/features/schedule/types";
import { bookingStatuses } from "@/features/bookings/types";
import { methods } from "@/features/payments/types";
import { useUrlState } from "@/lib/url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
interface Report {
  columns: { key: string; label: string }[];
  items: Record<string, string | number | null>[];
  total: number;
  summary: Record<string, number | null>;
  generatedAt: string;
}
const kinds = {
  FINANCE: "Оплаты и возвраты",
  ATTENDANCE: "Посещаемость",
  RESOURCES: "Загрузка залов и тренеров",
  MEMBERSHIPS: "Истекающие абонементы",
};
const sums: Record<string, string> = {
  incomeMinor: "Поступления",
  refundsMinor: "Возвраты",
  netMinor: "Чистые поступления",
  attended: "Посетили",
  noShow: "Неявки",
  lateCancelled: "Поздние отмены",
  attendanceRate: "Посещаемость",
  sessions: "Занятий",
  activeNow: "Активны сейчас",
  reservedOnly: "Остались резервы",
  expiring: "Истекают за период",
};
function summaryValue(key: string, value: number | null) {
  return value === null
    ? "Нет данных"
    : key.endsWith("Minor")
      ? money(value)
      : key === "attendanceRate"
        ? Math.round(value * 100) + "%"
        : value;
}
export function Reports({ area }: { area: "admin" | "trainer" }) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });
  const receptionOnly =
    area === "admin" &&
    !!me.data &&
    !me.data.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const { params, set } = useUrlState(),
    kind =
      params.get("kind") ?? (area === "trainer" ? "ATTENDANCE" : "FINANCE"),
    from = params.get("from") ?? addDays(localDay(), -30),
    to = params.get("to") ?? localDay(),
    page = Number(params.get("page")) || 1,
    trainerId = params.get("trainerId") ?? "",
    hallId = params.get("hallId") ?? "",
    method = params.get("method") ?? "",
    filters = {
      area,
      kind,
      from,
      to,
      page: String(page),
      ...(trainerId ? { trainerId } : {}),
      ...(hallId ? { hallId } : {}),
      ...(method ? { method } : {}),
    },
    qc = useQueryClient();
  const query = new URLSearchParams(filters).toString(),
    q = useQuery({
      queryKey: ["reports", query],
      queryFn: () => api<Report>("/reports?" + query),
    }),
    halls = useQuery({
      queryKey: ["report-halls"],
      queryFn: () =>
        api<{ items: { id: string; name: string }[] }>(
          "/catalog/halls?limit=100",
        ),
      enabled: area === "admin",
    }),
    trainers = useQuery({
      queryKey: ["report-trainers"],
      queryFn: () =>
        api<{ items: { id: string; name: string }[] }>(
          "/catalog/trainers?limit=100",
        ),
      enabled: area === "admin",
    }),
    exports = useQuery({
      queryKey: ["exports"],
      queryFn: () =>
        api<
          {
            id: string;
            status: string;
            rowCount: number | null;
            createdAt: string;
            expiresAt: string | null;
            lastError: string | null;
          }[]
        >("/exports"),
      refetchInterval: 5000,
    }),
    create = useMutation({
      mutationFn: () => post("/exports", filters, crypto.randomUUID()),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["exports"] }),
    });
  const change = (key: string, value: string) => {
    set(key, value);
    set("page", "1");
  };
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">КЛУБ В ЦИФРАХ</span>
          <h1>Отчёты</h1>
          <p>
            {area === "trainer"
              ? "Посещаемость и загрузка ваших занятий."
              : "Оплаты, посещения и сроки абонементов. Время — московское."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => create.mutate()}
          disabled={create.isPending || !q.data?.total}
        >
          Подготовить CSV
        </Button>
      </div>
      <div className="report-filters">
        <label>
          Отчёт
          <select
            className="form-select"
            value={kind}
            onChange={(e) => {
              change("kind", e.target.value);
              set("method", "");
            }}
          >
            {Object.entries(kinds)
              .filter(([k]) =>
                receptionOnly
                  ? k === "FINANCE"
                  : area !== "trainer" ||
                    ["ATTENDANCE", "RESOURCES"].includes(k),
              )
              .map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label>
          С даты
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => change("from", e.target.value)}
          />
        </label>
        <label>
          По дату
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => change("to", e.target.value)}
          />
        </label>
        {area === "admin" && ["ATTENDANCE", "RESOURCES"].includes(kind) && (
          <>
            <label>
              Тренер
              <select
                className="form-select"
                value={trainerId}
                onChange={(e) => change("trainerId", e.target.value)}
              >
                <option value="">Все тренеры</option>
                {trainers.data?.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Зал
              <select
                className="form-select"
                value={hallId}
                onChange={(e) => change("hallId", e.target.value)}
              >
                <option value="">Все залы</option>
                {halls.data?.items.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {kind === "FINANCE" && (
          <label>
            Способ оплаты
            <select
              className="form-select"
              value={method}
              onChange={(e) => change("method", e.target.value)}
            >
              <option value="">Все способы</option>
              {Object.entries(methods).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {create.error && <p className="form-error">{create.error.message}</p>}
      {q.error ? (
        <p className="form-error">{q.error.message}</p>
      ) : !q.data ? (
        <p role="status">Рассчитываем отчёт…</p>
      ) : (
        <>
          <div className="report-summary">
            {Object.entries(q.data.summary).map(([k, v]) => (
              <div className="surface" key={k}>
                <span className="muted">{sums[k] ?? k}</span>
                <strong>{summaryValue(k, v)}</strong>
              </div>
            ))}
          </div>
          <p className="muted text-xs my-5">
            {kind === "FINANCE"
              ? "Поступления и возвраты учитываются по дате подтверждения. Чистые поступления = поступления − возвраты."
              : kind === "ATTENDANCE"
                ? "Посещаемость = посетили / (посетили + неявки), только для завершённых занятий."
                : kind === "RESOURCES"
                  ? "Записи к началу восстановлены из истории; посещения отражают текущие отметки."
                  : "Число активных абонементов рассчитано сейчас. Период фильтрует даты окончания."}
          </p>
          <section className="surface table-surface">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {q.data.columns.map((c) => (
                      <th key={c.key}>
                        {c.key === "amount" ? "Сумма" : c.label}
                      </th>
                    ))}
                    <th>Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((r, i) => (
                    <tr key={String(r.id ?? i)}>
                      {q.data.columns.map((c) => (
                        <td key={c.key}>
                          {r[c.key] === null
                            ? "—"
                            : c.key === "date"
                              ? dateTime(String(r[c.key]))
                              : c.key === "amount"
                                ? money(Number(r[c.key]))
                                : c.key === "kind"
                                  ? r[c.key] === "PAYMENT"
                                    ? "Оплата"
                                    : "Возврат"
                                  : c.key === "method"
                                    ? methods[String(r[c.key])]
                                    : c.key === "status"
                                      ? (bookingStatuses[String(r[c.key])] ??
                                        r[c.key])
                                      : r[c.key]}
                        </td>
                      ))}
                      <td>
                        {r.href && (
                          <Link className="table-link" href={String(r.href)}>
                            Открыть →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!q.data.items.length && (
              <div className="empty-state">За этот период данных нет.</div>
            )}
          </section>
          <div className="pagination">
            <span>Всего: {q.data.total}</span>
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => set("page", String(page - 1))}
            >
              Назад
            </Button>
            <Button
              variant="ghost"
              disabled={page * 20 >= q.data.total}
              onClick={() => set("page", String(page + 1))}
            >
              Далее
            </Button>
          </div>
        </>
      )}
      <section className="surface mt-6">
        <h2>Мои выгрузки</h2>
        <p className="muted">
          Файлы доступны в течение суток. Большие отчёты готовятся в фоне.
        </p>
        {exports.error && <p className="form-error">{exports.error.message}</p>}
        {exports.data?.map((e) => (
          <div className="overview-session" key={e.id}>
            <div>
              <strong>{dateTime(e.createdAt)}</strong>
              <p>
                {
                  (
                    {
                      PENDING: "В очереди",
                      PROCESSING: "Формируется",
                      READY: "Готово",
                      FAILED: "Ошибка",
                      EXPIRED: "Срок хранения истёк",
                    } as Record<string, string>
                  )[e.status]
                }
                {e.rowCount !== null ? " · " + e.rowCount + " строк" : ""}
              </p>
              {e.lastError && <p className="form-error">{e.lastError}</p>}
            </div>
            {e.status === "READY" && (
              <Button asChild variant="outline">
                <a href={"/api/v1/exports/" + e.id + "/download"} download>
                  Скачать CSV
                </a>
              </Button>
            )}
          </div>
        ))}
        {exports.data?.length === 0 && (
          <p className="muted mt-4">Выгрузок пока нет.</p>
        )}
      </section>
    </>
  );
}
