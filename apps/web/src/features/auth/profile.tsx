"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizePhone, passwordError } from "@fitness/validation";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/image-upload";
import { dateTime } from "@/lib/format";
import { useRouter } from "next/navigation";
import { NotificationPreferences } from "@/features/operations/notifications";
export function Profile() {
  const qc = useQueryClient(),
    router = useRouter();
  const { data: user, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });
  const { data: sessions, error: sessionsError } = useQuery({
    queryKey: ["sessions"],
    queryFn: () =>
      api<Array<{ id: string; lastSeenAt: string; current: boolean }>>(
        "/auth/sessions",
      ),
  });
  const [pending, setPending] = useState(false),
    [passwordPending, setPasswordPending] = useState(false),
    [passwordKey, setPasswordKey] = useState(0);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const fields = new FormData(event.currentTarget);
    try {
      const phone = fields.get("phone")
        ? normalizePhone(String(fields.get("phone")))
        : null;
      if (fields.get("phone") && !phone)
        throw new Error("Введите номер телефона полностью");
      const updated = await api<User>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: fields.get("name"),
          ...(phone ? { phone } : {}),
        }),
      });
      qc.setQueryData(["me"], updated);
      toast.success("Профиль сохранён");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function password(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const issue = passwordError(String(fields.get("password")));
    if (issue) {
      toast.error(issue);
      return;
    }
    setPasswordPending(true);
    try {
      await api("/me/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: fields.get("currentPassword"),
          password: fields.get("password"),
        }),
      });
      form.reset();
      setPasswordKey((v) => v + 1);
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Пароль обновлён");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPasswordPending(false);
    }
  }
  if (error) return <p className="form-error">{error.message}</p>;
  if (!user) return <p role="status">Загружаем профиль…</p>;
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ВАШ АККАУНТ</span>
        <h1>Профиль</h1>
        <p>Контакты и безопасность вашего пространства.</p>
      </div>
      <div className="profile-grid">
        <section className="surface">
          <h2>Личные данные</h2>
          <ImageUpload kind="users" id={user.id} url={user.avatarUrl} />
          <form className="form-stack" onSubmit={save} key={user.id}>
            <div className="field">
              <Label htmlFor="profile-name">Имя</Label>
              <Input
                id="profile-name"
                name="name"
                defaultValue={user.name}
                required
                minLength={2}
              />
            </div>
            <div className="field">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user.email} disabled />
            </div>
            {user.clientId && (
              <div className="field">
                <Label htmlFor="phone">Телефон</Label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={user.client?.phone ?? ""}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
            )}
            <Button disabled={pending}>
              {pending ? "Сохраняем…" : "Сохранить изменения"}
            </Button>
          </form>
        </section>
        <section className="surface">
          <h2>Безопасность</h2>
          <form className="form-stack" onSubmit={password} key={passwordKey}>
            <div className="field">
              <Label htmlFor="current-password">Текущий пароль</Label>
              <PasswordInput
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
              />
            </div>
            <div className="field">
              <Label htmlFor="new-password">Новый пароль</Label>
              <PasswordInput
                id="new-password"
                strength
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
              />
            </div>
            <Button variant="outline" disabled={passwordPending}>
              {passwordPending ? "Обновляем пароль…" : "Изменить пароль"}
            </Button>
          </form>
          <h3 className="mt-8 mb-3">Активные сессии</h3>
          <div className="space-y-3 profile-sessions">
            {sessionsError && (
              <p className="form-error">{sessionsError.message}</p>
            )}
            {sessions?.map((s) => (
              <div className="session-row" key={s.id}>
                <span>
                  {dateTime(s.lastSeenAt)}
                  {s.current ? " · Эта сессия" : ""}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void api("/auth/sessions/" + s.id, { method: "DELETE" })
                      .then(() => {
                        if (s.current) {
                          qc.clear();
                          router.replace("/login");
                        } else
                          return qc.invalidateQueries({
                            queryKey: ["sessions"],
                          });
                      })
                      .catch((e) => toast.error(e.message))
                  }
                >
                  Завершить
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <NotificationPreferences />
    </>
  );
}
