"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post, type User } from "@/lib/api";
import { dateTime } from "@/lib/format";
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
import { toast } from "sonner";
const roles: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  RECEPTION: "Рецепция",
  TRAINER: "Тренер",
  CLIENT: "Клиент",
};
interface StaffUser {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: { role: string }[];
}
export function Staff() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [role, setRole] = useState(""),
    [invite, setInvite] = useState(false),
    [editing, setEditing] = useState<StaffUser | null>(null),
    qc = useQueryClient();
  const me = useQuery({
      queryKey: ["me"],
      queryFn: () => api<User>("/auth/me"),
    }),
    list = useQuery({
      queryKey: ["users", q, page, role],
      queryFn: () =>
        api<{ items: StaffUser[]; total: number }>(
          `/users?q=${encodeURIComponent(q)}&page=${page}${role ? "&role=" + role : ""}`,
        ),
    }),
    invitations = useQuery({
      queryKey: ["invitations"],
      queryFn: () =>
        api<
          {
            id: string;
            name: string;
            email: string;
            roles: string[];
            expiresAt: string;
          }[]
        >("/staff/invitations"),
    });
  const block = useMutation({
    mutationFn: ({ u, reason }: { u: StaffUser; reason: string }) =>
      post(`/users/${u.id}/block`, { blocked: u.status === "ACTIVE", reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Доступ обновлён");
    },
    onError: (e) => toast.error(e.message),
  });
  const owner = me.data?.roles.includes("OWNER");
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">КОМАНДА И ДОСТУП</span>
          <h1>Пользователи</h1>
          <p>Приглашения сотрудников, роли и доступ к системе.</p>
        </div>
        {me.data?.roles.some((r) => ["OWNER", "ADMIN"].includes(r)) && (
          <Button onClick={() => setInvite(true)}>Пригласить сотрудника</Button>
        )}
      </div>
      <div className="toolbar">
        <Input
          aria-label="Поиск пользователя"
          placeholder="Имя или email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Роль пользователя"
          className="form-select"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Все роли</option>
          {Object.entries(roles).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {list.error ? (
        <p className="form-error">{list.error.message}</p>
      ) : !list.data ? (
        <p role="status">Загружаем пользователей…</p>
      ) : (
        <>
          <section className="surface table-surface">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Роли</th>
                    <th>Доступ</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <p className="muted">{u.email}</p>
                      </td>
                      <td>{u.roles.map((r) => roles[r.role]).join(", ")}</td>
                      <td>
                        {u.status === "ACTIVE" ? "Открыт" : "Заблокирован"}
                      </td>
                      <td>
                        {u.id !== me.data?.id &&
                          !u.roles.some((r) => r.role === "OWNER") && (
                            <div className="flex gap-2">
                              {owner && (
                                <Button
                                  variant="outline"
                                  onClick={() => setEditing(u)}
                                >
                                  Роли
                                </Button>
                              )}
                              {(owner ||
                                !u.roles.some((r) => r.role === "ADMIN")) && (
                                <Button
                                  variant="ghost"
                                  disabled={block.isPending}
                                  onClick={() => {
                                    const reason = window.prompt(
                                      "Причина изменения доступа",
                                    );
                                    if (reason) block.mutate({ u, reason });
                                  }}
                                >
                                  {u.status === "ACTIVE"
                                    ? "Заблокировать"
                                    : "Восстановить"}
                                </Button>
                              )}
                            </div>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list.data.items.length && (
              <div className="empty-state">Пользователи не найдены.</div>
            )}
          </section>
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
      <section className="surface mt-6">
        <h2>Ожидают приглашения</h2>
        {invitations.error && (
          <p className="form-error">{invitations.error.message}</p>
        )}
        {invitations.data?.length ? (
          invitations.data.map((i) => (
            <div className="detail-list" key={i.id}>
              <div>
                <strong>{i.name}</strong>
                <span>
                  {i.email} · {i.roles.map((r) => roles[r]).join(", ")}
                </span>
                <span className="muted">
                  Действует до {dateTime(i.expiresAt)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">Активных приглашений нет.</p>
        )}
      </section>
      <Dialog
        open={invite || !!editing}
        onOpenChange={(v) => {
          if (!v) {
            setInvite(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Изменить роли" : "Пригласить сотрудника"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Все активные сессии пользователя завершатся."
                : "Сотрудник получит письмо и самостоятельно задаст пароль."}
            </DialogDescription>
          </DialogHeader>
          {(invite || editing) && (
            <StaffForm
              user={editing ?? undefined}
              owner={!!owner}
              done={() => {
                setInvite(false);
                setEditing(null);
                void qc.invalidateQueries({ queryKey: ["users"] });
                void qc.invalidateQueries({ queryKey: ["invitations"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function StaffForm({
  user,
  owner,
  done,
}: {
  user?: StaffUser;
  owner: boolean;
  done: () => void;
}) {
  const save = useMutation({
    mutationFn: (body: unknown) =>
      user
        ? api(`/users/${user.id}/roles`, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        : post("/staff/invitations", body),
    onSuccess: () => {
      toast.success(user ? "Роли сохранены" : "Приглашение отправлено");
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
          roles: f.getAll("roles"),
          ...(!user ? { name: f.get("name"), email: f.get("email") } : {}),
        });
      }}
    >
      {!user && (
        <>
          <Label htmlFor="staff-name">Имя</Label>
          <Input id="staff-name" name="name" minLength={2} required />
          <Label htmlFor="staff-email">Email</Label>
          <Input id="staff-email" name="email" type="email" required />
        </>
      )}
      <fieldset className="form-stack">
        <legend>Роли</legend>
        {Object.entries(roles)
          .filter(
            ([v]) =>
              v !== "OWNER" &&
              (owner || v !== "ADMIN") &&
              (user || v !== "CLIENT"),
          )
          .map(([v, l]) => (
            <label className="flex items-center gap-2" key={v}>
              <input
                type="checkbox"
                name="roles"
                value={v}
                defaultChecked={
                  user?.roles.some((r) => r.role === v) ?? v === "RECEPTION"
                }
              />
              {l}
            </label>
          ))}
      </fieldset>
      {save.error && <p className="form-error">{save.error.message}</p>}
      <Button disabled={save.isPending}>
        {user ? "Сохранить роли" : "Отправить приглашение"}
      </Button>
    </form>
  );
}
