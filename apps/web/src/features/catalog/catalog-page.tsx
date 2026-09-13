"use client";
import { Textarea } from "@/components/ui/textarea";

import { SelectField } from "@/components/ui/select-field";
import Link from "next/link";
import { useState, useMemo } from "react";
import { useUrlState, useDebounced } from "@/lib/url-state";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
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
import { DataTable } from "@/components/data-table";
export type Kind = "clients" | "trainers" | "halls" | "workouts";
export interface Row {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  capacity?: number;
  category?: string;
  description?: string;
  published?: boolean;
  archivedAt?: string;
  version: number;
  status?: string;
  bio?: string;
  user?: { name: string; email: string; avatarUrl?: string | null };
  specialties?: string[];
  equipment?: string[];
  workingHours?: Array<{ day: number; start: number; end: number }>;
  [key: string]: unknown;
}
const spec: Record<
  Kind,
  { title: string; description: string; single: string }
> = {
  clients: {
    title: "Клиенты",
    description: "Люди, их занятия и история взаимодействия с клубом.",
    single: "Новый клиент",
  },
  trainers: {
    title: "Команда тренеров",
    description: "Профили, специализации и доступность команды.",
    single: "Пригласить тренера",
  },
  halls: {
    title: "Пространства клуба",
    description: "Вместимость, оснащение и доступность каждого зала.",
    single: "Новый зал",
  },
  workouts: {
    title: "Направления",
    description: "Форматы занятий, уровни подготовки и условия участия.",
    single: "Новое направление",
  },
};
export type Field = {
  key: string;
  label: string;
  type?: "number" | "boolean" | "textarea" | "tags" | "email" | "select";
  required?: boolean;
  options?: [string, string][];
  default?: string | number | boolean;
  min?: number;
  max?: number;
};
export const fields: Record<Kind, Field[]> = {
  clients: [
    { key: "name", label: "Имя и фамилия", required: true },
    { key: "email", label: "Электронная почта", type: "email" },
    { key: "phone", label: "Телефон" },
    {
      key: "status",
      label: "Статус",
      type: "select",
      options: [
        ["ACTIVE", "Активен"],
        ["INACTIVE", "Неактивен"],
      ],
    },
  ],
  trainers: [
    { key: "bio", label: "О тренере", type: "textarea" },
    { key: "specialties", label: "Специализации через запятую", type: "tags" },
    { key: "published", label: "Показывать на сайте", type: "boolean" },
    {
      key: "active",
      label: "Доступен для занятий",
      type: "boolean",
      default: true,
    },
  ],
  halls: [
    { key: "name", label: "Название", required: true },
    { key: "slug", label: "Адрес страницы (латиницей)", required: true },
    { key: "description", label: "Описание", type: "textarea" },
    {
      key: "capacity",
      label: "Вместимость",
      type: "number",
      default: 12,
      min: 1,
      max: 500,
    },
    { key: "equipment", label: "Оснащение через запятую", type: "tags" },
    { key: "published", label: "Показывать на сайте", type: "boolean" },
  ],
  workouts: [
    { key: "name", label: "Название", required: true },
    { key: "slug", label: "Адрес страницы (латиницей)", required: true },
    { key: "description", label: "Описание", type: "textarea" },
    { key: "category", label: "Специализация тренера", required: true },
    {
      key: "level",
      label: "Уровень",
      type: "select",
      options: [
        ["ALL", "Любой"],
        ["BEGINNER", "Начальный"],
        ["INTERMEDIATE", "Средний"],
        ["ADVANCED", "Продвинутый"],
      ],
    },
    {
      key: "durationMinutes",
      label: "Длительность, мин.",
      type: "number",
      default: 60,
      min: 15,
      max: 240,
    },
    {
      key: "format",
      label: "Формат",
      type: "select",
      options: [
        ["GROUP", "Групповой"],
        ["PERSONAL", "Персональный"],
      ],
    },
    {
      key: "capacity",
      label: "Мест по умолчанию",
      type: "number",
      default: 12,
      min: 1,
      max: 500,
    },
    {
      key: "equipment",
      label: "Необходимое оснащение через запятую",
      type: "tags",
    },
    { key: "published", label: "Показывать на сайте", type: "boolean" },
  ],
};
export function FieldInput({
  field: f,
  value,
}: {
  field: Field;
  value?: unknown;
}) {
  const initial = value ?? f.default;
  return (
    <div className={"field " + (f.type === "textarea" ? "span-2" : "")}>
      <Label htmlFor={f.key}>{f.label}</Label>
      {f.type === "boolean" ? (
        <Input
          className="check-input"
          type="checkbox"
          name={f.key}
          id={f.key}
          defaultChecked={Boolean(initial)}
        />
      ) : f.type === "textarea" ? (
        <Textarea
          className="form-textarea"
          name={f.key}
          id={f.key}
          defaultValue={String(initial ?? "")}
          rows={4}
        />
      ) : f.type === "select" ? (
        <SelectField
          className="form-select"
          name={f.key}
          id={f.key}
          defaultValue={String(initial ?? f.options?.[0]?.[0])}
        >
          {f.options?.map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </SelectField>
      ) : (
        <Input
          id={f.key}
          name={f.key}
          type={
            f.type === "number"
              ? "number"
              : f.type === "email"
                ? "email"
                : "text"
          }
          required={f.required}
          min={f.min}
          max={f.max}
          defaultValue={
            Array.isArray(initial) ? initial.join(", ") : String(initial ?? "")
          }
        />
      )}
    </div>
  );
}
export function readFields(form: FormData, definition: Field[]) {
  return Object.fromEntries(
    definition.map((f) => {
      const value = String(form.get(f.key) ?? "");
      return [
        f.key,
        f.type === "boolean"
          ? form.has(f.key)
          : f.type === "number"
            ? Number(value)
            : f.type === "tags"
              ? value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
              : value,
      ];
    }),
  );
}
export function CatalogEditor({
  kind,
  row,
  onClose,
}: {
  kind: Kind;
  row?: Row;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isInvite = kind === "trainers" && !row;
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      row
        ? api("/catalog/" + kind + "/" + row.id, {
            method: "PATCH",
            body: JSON.stringify({ version: row.version, data }),
          })
        : post(isInvite ? "/staff/invitations" : "/catalog/" + kind, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success(isInvite ? "Приглашение отправлено" : "Данные сохранены");
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="editor-dialog">
        <DialogHeader>
          <DialogTitle>{row ? "Редактировать" : spec[kind].single}</DialogTitle>
          <DialogDescription>
            {isInvite
              ? "Тренер получит письмо для создания рабочего аккаунта."
              : "Заполните карточку. Изменения сохраняются в истории клуба."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            let data: Record<string, unknown>;
            if (isInvite)
              data = {
                name: fd.get("name"),
                email: fd.get("email"),
                roles: ["TRAINER"],
              };
            else {
              data = readFields(fd, fields[kind]);
              if (kind === "clients") {
                data.email = data.email || null;
                data.phone = data.phone || null;
              }
              if (kind === "trainers")
                data.workingHours = Array.from({ length: 7 }, (_, day) => day)
                  .filter((day) => fd.has("day" + day))
                  .map((day) => ({
                    day,
                    start: Number(fd.get("start" + day)),
                    end: Number(fd.get("end" + day)),
                  }));
            }
            mutation.mutate(data);
          }}
        >
          <div className="editor-grid">
            {isInvite ? (
              <>
                <FieldInput
                  field={{
                    key: "name",
                    label: "Имя и фамилия",
                    required: true,
                  }}
                />
                <FieldInput
                  field={{
                    key: "email",
                    label: "Email",
                    type: "email",
                    required: true,
                  }}
                />
              </>
            ) : (
              fields[kind].map((f) => (
                <FieldInput key={f.key} field={f} value={row?.[f.key]} />
              ))
            )}
          </div>
          {kind === "trainers" && row && (
            <fieldset className="hours-editor">
              <legend>Рабочие часы по Москве</legend>
              {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((label, day) => {
                const interval = row.workingHours?.find((h) => h.day === day);
                return (
                  <div key={day}>
                    <label>
                      <Input
                        type="checkbox"
                        name={"day" + day}
                        defaultChecked={!!interval}
                      />
                      {label}
                    </label>
                    <SelectField
                      aria-label={label + " начало"}
                      name={"start" + day}
                      defaultValue={interval?.start ?? 540}
                    >
                      {Array.from({ length: 48 }, (_, i) => (
                        <option key={i} value={i * 30}>
                          {String(Math.floor(i / 2)).padStart(2, "0")}:
                          {i % 2 ? "30" : "00"}
                        </option>
                      ))}
                    </SelectField>
                    <span>—</span>
                    <SelectField
                      aria-label={label + " окончание"}
                      name={"end" + day}
                      defaultValue={interval?.end ?? 1260}
                    >
                      {Array.from({ length: 48 }, (_, i) => (
                        <option key={i} value={(i + 1) * 30}>
                          {String(Math.floor((i + 1) / 2)).padStart(2, "0")}:
                          {(i + 1) % 2 ? "30" : "00"}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                );
              })}
            </fieldset>
          )}
          {mutation.error && (
            <p role="alert" className="form-error">
              {mutation.error.message}
            </p>
          )}
          <div className="form-actions">
            <Button variant="outline" type="button" onClick={onClose}>
              Отмена
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending
                ? "Сохраняем…"
                : isInvite
                  ? "Отправить приглашение"
                  : "Сохранить"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function CatalogPage({ kind }: { kind: Kind }) {
  const { params, set } = useUrlState();
  const q = params.get("q") ?? "",
    page = Math.max(1, Number(params.get("page")) || 1),
    archived = params.get("archived") === "true";
  const membership = params.get("membership") ?? "",
    lastVisit = params.get("lastVisit") ?? "",
    trainerId = params.get("trainerId") ?? "";
  const trainersFilter = useQuery({
    queryKey: ["catalog", "trainers", "filter"],
    queryFn: () => api<{ items: Row[] }>("/catalog/trainers?limit=100"),
    enabled: kind === "clients",
  });
  const setQ = (value: string) => set("q", value),
    setPage = (value: number) => set("page", String(value)),
    setArchived = (value: boolean) => set("archived", String(value));
  const search = useDebounced(q);
  const [creating, setCreating] = useState(false);
  const user = useQueryClient().getQueryData<User>(["me"]);
  const editable =
    kind === "clients" ||
    user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: [
      "catalog",
      kind,
      { q: search, page, archived, membership, lastVisit, trainerId },
    ],
    queryFn: ({ signal }) =>
      api<{ items: Row[]; total: number }>(
        "/catalog/" +
          kind +
          "?" +
          new URLSearchParams({
            q: search,
            page: String(page),
            archived: String(archived),
            ...(membership ? { membership } : {}),
            ...(lastVisit ? { lastVisit } : {}),
            ...(trainerId ? { trainerId } : {}),
          }),
        { signal },
      ),
  });
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: "name",
        header: kind === "clients" || kind === "trainers" ? "Имя" : "Название",
        cell: ({ row }) => (
          <Link
            className="table-title"
            href={"/admin/" + kind + "/" + row.original.id}
          >
            <span className="table-avatar">
              {String(row.original.name ?? row.original.user?.name ?? "")[0]}
            </span>
            <span>
              {row.original.name ?? row.original.user?.name}
              <small>
                {kind === "clients"
                  ? (row.original.email ?? row.original.user?.email)
                  : kind === "trainers"
                    ? row.original.specialties?.join(" · ")
                    : (row.original.category ??
                      String(
                        row.original.equipment?.slice(0, 2).join(" · ") ?? "",
                      ))}
              </small>
            </span>
          </Link>
        ),
      },
      {
        id: "info",
        header:
          kind === "clients"
            ? "Телефон"
            : kind === "trainers"
              ? "Публикация"
              : "Вместимость",
        cell: ({ row }) =>
          kind === "clients"
            ? (row.original.phone ?? "Не указан")
            : kind === "trainers"
              ? row.original.published
                ? "На сайте"
                : "Скрыт"
              : row.original.capacity + " мест",
      },
      {
        id: "status",
        header: "Статус",
        cell: ({ row }) => (
          <span
            className={
              "status-pill " + (row.original.archivedAt ? "is-muted" : "")
            }
          >
            {row.original.archivedAt
              ? "В архиве"
              : row.original.status === "INACTIVE"
                ? "Неактивен"
                : "Активен"}
          </span>
        ),
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <Link
            aria-label="Открыть карточку"
            className="table-open"
            href={"/admin/" + kind + "/" + row.original.id}
          ></Link>
        ),
      },
    ],
    [kind],
  );
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">УПРАВЛЕНИЕ КЛУБОМ</span>
          <h1>{spec[kind].title}</h1>
          <p>{spec[kind].description}</p>
        </div>
        {editable && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={17} />
            {spec[kind].single}
          </Button>
        )}
      </div>
      <div className="table-toolbar">
        {kind === "clients" && (
          <>
            <SelectField
              className="form-select"
              aria-label="Абонемент клиента"
              value={membership}
              onChange={(e) => {
                set("membership", e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все абонементы</option>
              <option value="current">Действует по сроку</option>
              <option value="none">Нет действующего</option>
            </SelectField>
            <SelectField
              className="form-select"
              aria-label="Последнее посещение"
              value={lastVisit}
              onChange={(e) => {
                set("lastVisit", e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все посещения</option>
              <option value="recent">Посещали за 30 дней</option>
              <option value="inactive">Не посещали 30 дней</option>
            </SelectField>
            <SelectField
              className="form-select"
              aria-label="Тренер клиента"
              value={trainerId}
              onChange={(e) => {
                set("trainerId", e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все тренеры</option>
              {trainersFilter.data?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.user?.name}
                </option>
              ))}
            </SelectField>
          </>
        )}
        <div className="search-field">
          <Search size={17} />
          <Input
            aria-label="Поиск"
            placeholder="Поиск по имени или названию"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="inline-check">
          <Input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
            }}
          />
          Архив
        </label>
      </div>
      {error ? (
        <div className="form-error" role="alert">
          {error.message}
          <Button variant="ghost" onClick={() => void refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          total={data?.total ?? 0}
          page={page}
          onPage={setPage}
          loading={isFetching}
        />
      )}{" "}
      {creating && (
        <CatalogEditor kind={kind} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
