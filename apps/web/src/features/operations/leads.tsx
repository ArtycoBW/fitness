"use client";
import { Textarea } from "@/components/ui/textarea";

import { SelectField } from "@/components/ui/select-field";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
const statuses: Record<string, string> = {
  NEW: "Новое",
  CONTACTED: "Связались",
  SCHEDULED: "Запланирован визит",
  WON: "Клиент клуба",
  CLOSED: "Закрыто",
};
interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  status: string;
  assignedTo: string | null;
  version: number;
  createdAt: string;
  events: { id: string; status: string; note: string; createdAt: string }[];
}
export function Leads() {
  const { params, set } = useUrlState(),
    q = params.get("q") ?? "",
    status = params.get("status") ?? "",
    page = Number(params.get("page")) || 1,
    list = useQuery({
      queryKey: ["leads", q, status, page],
      queryFn: () =>
        api<{ items: Lead[]; total: number }>(
          `/leads?q=${encodeURIComponent(q)}&page=${page}${status ? "&status=" + status : ""}`,
        ),
    });
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ЗНАКОМСТВО С КЛУБОМ</span>
        <h1>Обращения</h1>
        <p>Заявки с сайта и история работы с ними.</p>
      </div>
      <div className="toolbar">
        <Input
          aria-label="Поиск обращения"
          placeholder="Имя, телефон или email"
          value={q}
          onChange={(e) => {
            set("q", e.target.value);
            set("page", "1");
          }}
        />
        <SelectField
          className="form-select"
          aria-label="Статус обращения"
          value={status}
          onChange={(e) => {
            set("status", e.target.value);
            set("page", "1");
          }}
        >
          <option value="">Все статусы</option>
          {Object.entries(statuses).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
      </div>
      {list.error ? (
        <p className="form-error">{list.error.message}</p>
      ) : !list.data ? (
        <p role="status">Загружаем обращения…</p>
      ) : (
        <>
          <section className="surface">
            {list.data.items.map((l) => (
              <article className="overview-session" key={l.id}>
                <time>{dateTime(l.createdAt)}</time>
                <div>
                  <Link className="table-link" href={"/admin/leads/" + l.id}>
                    {l.name}
                  </Link>
                  <p>
                    {l.phone} · {l.email}
                  </p>
                </div>
                <span className="status-pill">{statuses[l.status]}</span>
                <Button asChild variant="outline">
                  <Link href={"/admin/leads/" + l.id}>Открыть</Link>
                </Button>
              </article>
            ))}
            {!list.data.items.length && (
              <div className="empty-state">
                <h2>Обращений пока нет</h2>
                <p>Новые заявки с сайта появятся здесь.</p>
              </div>
            )}
          </section>
          <div className="pagination">
            <span>Всего: {list.data.total}</span>
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => set("page", String(page - 1))}
            >
              Назад
            </Button>
            <Button
              variant="ghost"
              disabled={page * 20 >= list.data.total}
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
export function LeadDetail({ id }: { id: string }) {
  const qc = useQueryClient(),
    q = useQuery({
      queryKey: ["lead", id],
      queryFn: () => api<Lead>("/leads/" + id),
    }),
    staff = useQuery({
      queryKey: ["staff-options"],
      queryFn: () => api<{ id: string; name: string }[]>("/staff/options"),
    }),
    save = useMutation({
      mutationFn: (body: unknown) =>
        api("/leads/" + id, { method: "PUT", body: JSON.stringify(body) }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["lead", id] });
        void qc.invalidateQueries({ queryKey: ["leads"] });
        toast.success("Обращение обновлено");
      },
    });
  return (
    <>
      <Link className="back-link" href="/admin/leads">
        ← Все обращения
      </Link>
      {q.error || staff.error ? (
        <p className="form-error">{(q.error ?? staff.error)?.message}</p>
      ) : !q.data || !staff.data ? (
        <p role="status">Открываем обращение…</p>
      ) : (
        <>
          <div className="page-heading">
            <span className="eyebrow">
              ОБРАЩЕНИЕ · {dateTime(q.data.createdAt)}
            </span>
            <h1>{q.data.name}</h1>
            <p>
              {q.data.phone} · {q.data.email}
            </p>
          </div>
          <div className="detail-grid">
            <section className="surface">
              <h2>Сообщение</h2>
              <p className="whitespace-pre-line my-5">{q.data.message}</p>
              <h2>История</h2>
              {q.data.events.map((e) => (
                <article className="timeline" key={e.id}>
                  <strong>{statuses[e.status]}</strong>
                  <p>{e.note}</p>
                  <time className="muted">{dateTime(e.createdAt)}</time>
                </article>
              ))}
            </section>
            <section className="surface">
              <h2>Работа с обращением</h2>
              <form
                key={q.data.version}
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  save.mutate({
                    version: q.data!.version,
                    status: f.get("status"),
                    assignedTo: f.get("assignedTo") || null,
                    note: f.get("note"),
                  });
                }}
              >
                <Label htmlFor="lead-status">Статус</Label>
                <SelectField
                  id="lead-status"
                  name="status"
                  className="form-select"
                  defaultValue={q.data.status}
                >
                  {Object.entries(statuses).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </SelectField>
                <Label htmlFor="lead-assignee">Ответственный</Label>
                <SelectField
                  id="lead-assignee"
                  name="assignedTo"
                  className="form-select"
                  defaultValue={q.data.assignedTo ?? ""}
                >
                  <option value="">Не назначен</option>
                  {staff.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
                <Label htmlFor="lead-note">Результат контакта</Label>
                <Textarea
                  id="lead-note"
                  name="note"
                  className="form-textarea"
                  minLength={3}
                  maxLength={500}
                  rows={4}
                  required
                />
                {(save.error || staff.error) && (
                  <p className="form-error">
                    {(save.error ?? staff.error)?.message}
                  </p>
                )}
                <Button disabled={save.isPending}>Сохранить результат</Button>
              </form>
            </section>
          </div>
        </>
      )}
    </>
  );
}
