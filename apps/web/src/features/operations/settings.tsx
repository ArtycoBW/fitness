"use client";

import { SelectField } from "@/components/ui/select-field";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
const policy: Record<string, { label: string; min: number; max: number }> = {
  bookingOpenDays: { label: "Открывать запись за, дней", min: 1, max: 60 },
  bookingCloseMinutes: {
    label: "Закрывать запись за, минут",
    min: 0,
    max: 240,
  },
  cancelMinutes: { label: "Бесплатная отмена за, минут", min: 0, max: 1440 },
  waitlistCutoffMinutes: {
    label: "Останавливать очередь за, минут",
    min: 15,
    max: 240,
  },
  attendanceBeforeMinutes: {
    label: "Отмечать посещение до начала, минут",
    min: 0,
    max: 60,
  },
  attendanceAfterHours: {
    label: "Окно отметки после занятия, часов",
    min: 1,
    max: 72,
  },
  hallBufferMinutes: { label: "Подготовка зала, минут", min: 0, max: 60 },
  trainerBufferMinutes: { label: "Перерыв тренера, минут", min: 0, max: 60 },
};
interface Settings {
  version: number;
  timezone: string;
  currency: string;
  data: {
    name: string;
    address: string;
    phone: string;
    email: string;
    hours: string;
    legalName: string;
    bookingPolicy: Record<string, number>;
  };
}
export function Settings() {
  const qc = useQueryClient(),
    q = useQuery({
      queryKey: ["settings"],
      queryFn: () => api<Settings>("/settings"),
    }),
    save = useMutation({
      mutationFn: (body: unknown) =>
        api("/settings", { method: "PUT", body: JSON.stringify(body) }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["settings"] });
        void qc.invalidateQueries({ queryKey: ["public-club"] });
        toast.success("Настройки сохранены");
      },
    });
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ПРАВИЛА И КОНТАКТЫ</span>
        <h1>Настройки клуба</h1>
        <p>Контакты на сайте и правила для новых занятий.</p>
      </div>
      {q.error ? (
        <p className="form-error">{q.error.message}</p>
      ) : !q.data ? (
        <p role="status">Загружаем настройки…</p>
      ) : (
        <form
          key={q.data.version}
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              version: q.data!.version,
              reason: f.get("reason"),
              data: {
                ...Object.fromEntries(
                  [
                    "name",
                    "address",
                    "phone",
                    "email",
                    "hours",
                    "legalName",
                  ].map((k) => [k, f.get(k)]),
                ),
                bookingPolicy: Object.fromEntries(
                  Object.keys(policy).map((k) => [k, Number(f.get(k))]),
                ),
              },
            });
          }}
        >
          <section className="surface">
            <h2>О клубе</h2>
            <div className="settings-policy mt-5">
              {Object.entries({
                name: "Название",
                address: "Адрес",
                phone: "Телефон",
                email: "Email",
                hours: "Часы работы",
                legalName: "Наименование организации",
              }).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <Input
                    name={key}
                    required={["name", "email"].includes(key)}
                    type={key === "email" ? "email" : "text"}
                    defaultValue={String(
                      q.data!.data[key as keyof Settings["data"]],
                    )}
                  />
                </label>
              ))}
            </div>
            <p className="muted mt-5">
              Часовой пояс: {q.data.timezone}. Валюта: {q.data.currency}.
            </p>
          </section>
          <section className="surface">
            <h2>Запись и посещение</h2>
            <p className="muted mb-5">
              Опубликованные занятия сохраняют прежние условия. Буферы
              учитываются при проверке занятости новых занятий.
            </p>
            <div className="settings-policy">
              {Object.entries(policy).map(([key, p]) => (
                <label key={key}>
                  {p.label}
                  <Input
                    type="number"
                    name={key}
                    min={p.min}
                    max={p.max}
                    required
                    defaultValue={q.data!.data.bookingPolicy[key]}
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="surface form-stack">
            <Label htmlFor="settings-reason">Причина изменений</Label>
            <Input
              id="settings-reason"
              name="reason"
              minLength={3}
              maxLength={500}
              required
            />
            {save.error && <p className="form-error">{save.error.message}</p>}
            <Button disabled={save.isPending}>Сохранить настройки</Button>
          </section>
        </form>
      )}
    </>
  );
}
export function Audit() {
  const { params, set } = useUrlState(),
    page = Number(params.get("page")) || 1,
    q = params.get("q") ?? "",
    query = useQuery({
      queryKey: ["audit", page, q],
      queryFn: () =>
        api<{
          items: {
            id: string;
            actorName: string;
            action: string;
            entityType: string;
            entityId: string;
            reason: string | null;
            changes: unknown;
            requestId: string | null;
            createdAt: string;
          }[];
          total: number;
        }>(`/audit?page=${page}&q=${encodeURIComponent(q)}`),
    });
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ИСТОРИЯ ДЕЙСТВИЙ</span>
        <h1>Журнал клуба</h1>
        <p>Изменения, ответственные сотрудники и причины операций.</p>
      </div>
      <div className="toolbar">
        <Input
          aria-label="Поиск действия"
          placeholder="Код действия, например REFUND"
          value={q}
          onChange={(e) => {
            set("q", e.target.value);
            set("page", "1");
          }}
        />
      </div>
      {query.error ? (
        <p className="form-error">{query.error.message}</p>
      ) : !query.data ? (
        <p role="status">Загружаем журнал…</p>
      ) : (
        <>
          <section className="surface">
            {query.data.items.map((a) => (
              <details className="program-version" key={a.id}>
                <summary>
                  {dateTime(a.createdAt)} · {a.actorName} · {a.action}
                </summary>
                <p>
                  {a.entityType} · {a.entityId}
                </p>
                {a.reason && <p>{a.reason}</p>}
                <pre className="audit-changes mt-4">
                  {JSON.stringify(a.changes, null, 2)}
                </pre>
                {a.requestId && (
                  <p className="muted text-xs">Запрос: {a.requestId}</p>
                )}
              </details>
            ))}
          </section>
          <div className="pagination">
            <span>Всего: {query.data.total}</span>
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => set("page", String(page - 1))}
            >
              Назад
            </Button>
            <Button
              variant="ghost"
              disabled={page * 20 >= query.data.total}
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
export function Deliveries() {
  const { params, set } = useUrlState(),
    status = params.get("status") ?? "DEAD",
    page = Number(params.get("page")) || 1,
    qc = useQueryClient(),
    q = useQuery({
      queryKey: ["deliveries", status, page],
      queryFn: () =>
        api<{
          items: {
            id: string;
            status: string;
            attempts: number;
            availableAt: string;
            lastError: string | null;
            createdAt: string;
          }[];
          total: number;
        }>(`/deliveries?page=${page}${status ? "&status=" + status : ""}`),
      refetchInterval: 10000,
    }),
    retry = useMutation({
      mutationFn: (id: string) => post("/deliveries/" + id + "/retry"),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["deliveries"] }),
      onError: (e) => toast.error(e.message),
    });
  const labels: Record<string, string> = {
    PENDING: "Ожидает отправки",
    PROCESSING: "Отправляется",
    SENT: "Обработано",
    DEAD: "Требует внимания",
  };
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">СЛУЖБА ДОСТАВКИ</span>
        <h1>Отправка писем</h1>
        <p>Состояние очереди и повторная доставка после устранения ошибки.</p>
      </div>
      <div className="toolbar">
        <SelectField
          className="form-select"
          aria-label="Статус доставки"
          value={status}
          onChange={(e) => {
            set("status", e.target.value);
            set("page", "1");
          }}
        >
          <option value="">Все события</option>
          {Object.entries(labels).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </SelectField>
      </div>
      {q.error ? (
        <p className="form-error">{q.error.message}</p>
      ) : !q.data ? (
        <p role="status">Загружаем очередь…</p>
      ) : (
        <>
          <section className="surface">
            {q.data.items.map((e) => (
              <div className="overview-session" key={e.id}>
                <div>
                  <strong>
                    {labels[e.status]} · {dateTime(e.createdAt)}
                  </strong>
                  <p>
                    Попыток: {e.attempts} · {e.id}
                  </p>
                  {e.lastError && (
                    <p>
                      Письмо не удалось доставить. Проверьте почтовый сервис.
                    </p>
                  )}
                </div>
                {e.status === "DEAD" && (
                  <Button
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(e.id)}
                  >
                    Повторить доставку
                  </Button>
                )}
              </div>
            ))}
            {!q.data.items.length && (
              <div className="empty-state">Событий с таким статусом нет.</div>
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
    </>
  );
}
