"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api, post } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
interface Notice {
  id: string;
  type: string;
  title: string;
  text: string;
  href: string;
  createdAt: string;
  readAt: string | null;
}
interface Notices {
  items: Notice[];
  total: number;
  unread: number;
}
export function NotificationBell({ area }: { area: string }) {
  const q = useQuery({
    queryKey: ["notification-count"],
    queryFn: () => api<Notices>("/notifications?limit=1"),
    refetchInterval: 15000,
  });
  return (
    <Link
      className="notification-bell"
      href={`/${area}/notifications`}
      aria-label={`Уведомления${q.data?.unread ? ", непрочитанных: " + q.data.unread : ""}`}
    >
      <Bell size={20} />
      {!!q.data?.unread && (
        <span>{q.data.unread > 99 ? "99+" : q.data.unread}</span>
      )}
    </Link>
  );
}
export function Notifications() {
  const { params, set } = useUrlState(),
    page = Number(params.get("page")) || 1,
    unread = params.get("unread") === "true",
    qc = useQueryClient(),
    q = useQuery({
      queryKey: ["notifications", page, unread],
      queryFn: () =>
        api<Notices>(`/notifications?page=${page}&unread=${unread}`),
      refetchInterval: 15000,
    }),
    read = useMutation({
      mutationFn: (id?: string) =>
        post(id ? `/notifications/${id}/read` : "/notifications/read-all"),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        void qc.invalidateQueries({ queryKey: ["notification-count"] });
      },
      onError: (e) => toast.error(e.message),
    });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">СОБЫТИЯ ВАШЕГО КЛУБА</span>
          <h1>Уведомления</h1>
          <p>Изменения расписания, оплаты и важные напоминания.</p>
        </div>
        <Button
          variant="outline"
          disabled={read.isPending || !q.data?.unread}
          onClick={() => read.mutate(undefined)}
        >
          Прочитать все
        </Button>
      </div>
      <div className="toolbar">
        <label>
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              set("unread", String(e.target.checked));
              set("page", "1");
            }}
          />{" "}
          Только непрочитанные
        </label>
      </div>
      {q.error ? (
        <p className="form-error">{q.error.message}</p>
      ) : !q.data ? (
        <p role="status">Загружаем уведомления…</p>
      ) : (
        <>
          <section className="surface notice-list">
            {q.data.items.map((n) => (
              <article
                className={"notice-row " + (!n.readAt ? "is-unread" : "")}
                key={n.id}
              >
                <div>
                  <time>{dateTime(n.createdAt)}</time>
                  <h2>
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!n.readAt) read.mutate(n.id);
                      }}
                    >
                      {n.title}
                    </Link>
                  </h2>
                  <p className="whitespace-pre-line">{n.text}</p>
                </div>
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    disabled={read.isPending}
                    onClick={() => read.mutate(n.id)}
                  >
                    Прочитано
                  </Button>
                )}
              </article>
            ))}
            {!q.data.items.length && (
              <div className="empty-state">
                <Bell />
                <h2>{unread ? "Всё прочитано" : "Пока тихо"}</h2>
                <p>Новые события появятся здесь.</p>
              </div>
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
const prefLabels = {
  bookingEmail: "Письма о записях и изменениях расписания",
  programEmail: "Письма о программах занятий",
  paymentEmail: "Письма об оплатах и возвратах",
  reminders: "Напоминания о занятиях и сроках абонемента",
  reminderEmail: "Дублировать напоминания по почте",
};
export function NotificationPreferences() {
  const qc = useQueryClient(),
    q = useQuery({
      queryKey: ["notification-preferences"],
      queryFn: () =>
        api<Record<keyof typeof prefLabels, boolean>>(
          "/me/notification-preferences",
        ),
    }),
    save = useMutation({
      mutationFn: (body: unknown) =>
        api("/me/notification-preferences", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["notification-preferences"] });
        toast.success("Настройки уведомлений сохранены");
      },
    });
  return (
    <section className="surface mt-6">
      <h2>Уведомления</h2>
      <p className="muted mb-5">
        Подтверждение адреса, восстановление доступа и приглашения всегда
        приходят по почте.
      </p>
      {q.error ? (
        <p className="form-error">{q.error.message}</p>
      ) : q.data ? (
        <form
          className="form-stack"
          key={JSON.stringify(q.data)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate(
              Object.fromEntries(
                Object.keys(prefLabels).map((k) => [k, f.has(k)]),
              ),
            );
          }}
        >
          {Object.entries(prefLabels).map(([key, label]) => (
            <label className="flex items-start gap-3" key={key}>
              <input
                className="mt-1"
                type="checkbox"
                name={key}
                defaultChecked={q.data[key as keyof typeof prefLabels]}
              />
              {label}
            </label>
          ))}
          {save.error && <p className="form-error">{save.error.message}</p>}
          <Button variant="outline" disabled={save.isPending}>
            Сохранить уведомления
          </Button>
        </form>
      ) : (
        <p role="status">Загружаем настройки…</p>
      )}
    </section>
  );
}
