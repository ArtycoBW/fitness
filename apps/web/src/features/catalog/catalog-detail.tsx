"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, ArrowLeft, Archive, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ImageUpload } from "@/components/image-upload";
import { api, post, type User } from "@/lib/api";
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
import { CatalogEditor, fields, type Kind, type Row } from "./catalog-page";
interface Detail extends Row {
  visitsBlocked?: boolean;
  userId?: string;
  notes?: { id: string; text: string; createdAt: string }[];
  trainers?: { trainerId: string; trainer: { user: { name: string } } }[];
  absences?: { id: string; startAt: string; endAt: string; reason: string }[];
  closures?: { id: string; startAt: string; endAt: string; reason: string }[];
}
export function CatalogDetail({ kind, id }: { kind: Kind; id: string }) {
  const qc = useQueryClient();
  const user = qc.getQueryData<User>(["me"]);
  const admin = !!user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const [editing, setEditing] = useState(false),
    [action, setAction] = useState("");
  const { data: item, error } = useQuery({
    queryKey: ["catalog", kind, id],
    queryFn: () => api<Detail>("/catalog/" + kind + "/" + id),
  });
  const { data: trainers } = useQuery({
    queryKey: ["catalog", "trainers", "options"],
    queryFn: () => api<{ items: Row[] }>("/catalog/trainers?limit=100"),
    enabled: action === "trainers",
  });
  const mutation = useMutation({
    mutationFn: ({ action, data }: { action: string; data: unknown }) =>
      post("/catalog/" + kind + "/" + id + "/" + action, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success("Изменения сохранены");
      setAction("");
    },
  });
  if (error)
    return (
      <p role="alert" className="form-error">
        {error.message}
      </p>
    );
  if (!item) return <p role="status">Загрузка карточки…</p>;
  const title = item.name ?? item.user?.name;
  const periods = item.closures ?? item.absences ?? [];
  return (
    <>
      <Link className="back-link" href={"/admin/" + kind}>
        <ArrowLeft size={15} />К списку
      </Link>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">
            КАРТОЧКА · {item.archivedAt ? "АРХИВ" : "АКТИВНА"}
          </span>
          <h1>{title}</h1>
          <p>{item.user?.email ?? item.email ?? item.category ?? ""}</p>
        </div>
        <div className="button-row">
          {(admin || kind === "clients") && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil size={16} />
              Редактировать
            </Button>
          )}
          {admin && (
            <Button variant="ghost" onClick={() => setAction("archive")}>
              <Archive size={16} />
              {item.archivedAt ? "Восстановить" : "В архив"}
            </Button>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <section className="surface">
          <h2>Основные сведения</h2>
          {admin && kind !== "clients" && (
            <ImageUpload
              kind={kind === "trainers" ? "users" : kind}
              id={kind === "trainers" ? String(item.userId) : id}
              url={
                kind === "trainers"
                  ? item.user?.avatarUrl
                  : typeof item.imageUrl === "string"
                    ? item.imageUrl
                    : null
              }
            />
          )}
          <dl className="detail-list">
            {fields[kind]
              .filter((f) => f.key !== "name")
              .map((f) => (
                <div key={f.key}>
                  <dt>{f.label.replace(" через запятую", "")}</dt>
                  <dd>
                    {Array.isArray(item[f.key])
                      ? (item[f.key] as string[]).join(", ") || "Не указано"
                      : typeof item[f.key] === "boolean"
                        ? item[f.key]
                          ? "Да"
                          : "Нет"
                        : f.type === "select"
                          ? (f.options?.find(
                              ([value]) => value === item[f.key],
                            )?.[1] ?? String(item[f.key]))
                          : String(
                              item[f.key] ??
                                (f.key === "email" ? item.user?.email : null) ??
                                "Не указано",
                            )}
                  </dd>
                </div>
              ))}
          </dl>
          {kind === "clients" && (
            <div className="detail-actions">
              {!item.userId && (
                <Button
                  variant="outline"
                  onClick={() => setAction("invitation")}
                >
                  <Mail size={16} />
                  Пригласить в кабинет
                </Button>
              )}
              {admin && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setAction("trainers")}
                  >
                    <UserPlus size={16} />
                    Назначить тренера
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setAction("visits-access")}
                  >
                    {item.visitsBlocked
                      ? "Разрешить посещения"
                      : "Ограничить посещения"}
                  </Button>
                </>
              )}
              {item.visitsBlocked && (
                <p className="form-error">Посещения ограничены</p>
              )}
              {item.trainers?.map((t) => (
                <p key={t.trainerId}>Тренер: {t.trainer.user.name}</p>
              ))}
            </div>
          )}
        </section>
        {kind === "clients" ? (
          <section className="surface">
            <h2>Заметки команды</h2>
            <p className="muted">Видны сотрудникам клуба.</p>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                mutation.mutate(
                  {
                    action: "notes",
                    data: { text: new FormData(form).get("text") },
                  },
                  { onSuccess: () => form.reset() },
                );
              }}
            >
              <Label htmlFor="text">Новая заметка</Label>
              <textarea
                name="text"
                id="text"
                className="form-textarea"
                required
                maxLength={2000}
              />
              <Button disabled={mutation.isPending}>Добавить заметку</Button>
            </form>
            <div className="timeline">
              {item.notes?.map((n) => (
                <article key={n.id}>
                  <small>{new Date(n.createdAt).toLocaleString("ru-RU")}</small>
                  <p>{n.text}</p>
                </article>
              ))}
            </div>
          </section>
        ) : kind === "halls" || kind === "trainers" ? (
          <section className="surface">
            <h2>
              {kind === "halls"
                ? "Технические закрытия"
                : "Недоступность тренера"}
            </h2>
            {admin && (
              <Button
                variant="outline"
                onClick={() =>
                  setAction(kind === "halls" ? "closures" : "absences")
                }
              >
                Добавить период
              </Button>
            )}
            {periods.length ? (
              periods.map((p) => (
                <div className="timeline" key={p.id}>
                  <p>
                    {new Date(p.startAt).toLocaleString("ru-RU")} —{" "}
                    {new Date(p.endAt).toLocaleString("ru-RU")}
                  </p>
                  <span className="muted">{p.reason}</span>
                </div>
              ))
            ) : (
              <p className="muted mt-6">Ограничений по датам нет.</p>
            )}
          </section>
        ) : null}
      </div>
      {editing && (
        <CatalogEditor
          kind={kind}
          row={item}
          onClose={() => setEditing(false)}
        />
      )}
      <Dialog open={!!action} onOpenChange={(open) => !open && setAction("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {
                {
                  archive: item.archivedAt
                    ? "Восстановить карточку"
                    : "Перенести в архив",
                  invitation: "Приглашение в кабинет",
                  trainers: "Назначить тренера",
                  "visits-access": "Доступ к посещениям",
                  closures: "Закрытие зала",
                  absences: "Недоступность тренера",
                }[action]
              }
            </DialogTitle>
            <DialogDescription>
              История изменений сохранится в журнале клуба.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const data =
                action === "archive"
                  ? {
                      version: item.version,
                      archived: !item.archivedAt,
                      reason: fd.get("reason"),
                    }
                  : action === "visits-access"
                    ? { blocked: !item.visitsBlocked, reason: fd.get("reason") }
                    : action === "invitation"
                      ? { email: fd.get("email") }
                      : action === "trainers"
                        ? { trainerId: fd.get("trainerId"), assigned: true }
                        : {
                            startAt: new Date(
                              String(fd.get("startAt")),
                            ).toISOString(),
                            endAt: new Date(
                              String(fd.get("endAt")),
                            ).toISOString(),
                            reason: fd.get("reason"),
                          };
              mutation.mutate({ action, data });
            }}
          >
            {action === "invitation" ? (
              <div className="field">
                <Label htmlFor="inviteEmail">Email клиента</Label>
                <Input
                  id="inviteEmail"
                  name="email"
                  type="email"
                  required
                  defaultValue={String(item.email ?? "")}
                />
              </div>
            ) : action === "trainers" ? (
              <div className="field">
                <Label htmlFor="trainerId">Тренер</Label>
                <select
                  className="form-select"
                  id="trainerId"
                  name="trainerId"
                  required
                >
                  {trainers?.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                {["closures", "absences"].includes(action) && (
                  <>
                    <Label htmlFor="startAt">Начало</Label>
                    <Input
                      name="startAt"
                      id="startAt"
                      type="datetime-local"
                      required
                    />
                    <Label htmlFor="endAt">Окончание</Label>
                    <Input
                      name="endAt"
                      id="endAt"
                      type="datetime-local"
                      required
                    />
                  </>
                )}
                <Label htmlFor="reason">Причина</Label>
                <Input id="reason" name="reason" required minLength={3} />
              </>
            )}
            {mutation.error && (
              <p role="alert" className="form-error">
                {mutation.error.message}
              </p>
            )}
            <Button disabled={mutation.isPending}>Подтвердить</Button>
          </form>
        </DialogContent>
      </Dialog>
      {mutation.error && !action && (
        <p className="form-error">{mutation.error.message}</p>
      )}
    </>
  );
}
