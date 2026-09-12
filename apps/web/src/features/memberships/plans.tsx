"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowUpRight, Check } from "lucide-react";
import { toast } from "sonner";
import { api, post, type User } from "@/lib/api";
import { money, visits } from "@/lib/format";
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
export interface PlanVersion {
  id: string;
  number: number;
  title: string;
  description: string;
  priceMinor: number;
  durationDays: number;
  visitLimit: number | null;
  freezeQuotaDays: number;
  activationWindowDays: number;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  workouts: { id: string; name: string }[];
  halls: { id: string; name: string }[];
  trainers: { id: string; user: { name: string } }[];
}
export interface Plan {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  archivedAt: string | null;
  version: number;
  versions: PlanVersion[];
}
export function PlanEditor({
  plan,
  onClose,
}: {
  plan?: Plan;
  onClose: () => void;
}) {
  const v = plan?.versions[0],
    qc = useQueryClient();
  const [unlimited, setUnlimited] = useState(v ? v.visitLimit === null : false);
  const { data: resources } = useQuery({
    queryKey: ["plan-resources"],
    queryFn: async () => {
      const kinds = ["workouts", "trainers", "halls"];
      const results = await Promise.all(
        kinds.map((k) =>
          api<{ items: { id: string; name: string }[] }>(
            "/catalog/" + k + "?limit=100",
          ),
        ),
      );
      return Object.fromEntries(
        kinds.map((k, i) => [k, results[i]?.items ?? []]),
      );
    },
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      plan
        ? api("/membership-plans/" + plan.id, {
            method: "PATCH",
            body: JSON.stringify({ version: plan.version, data }),
          })
        : post("/membership-plans", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Версия тарифа сохранена");
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="editor-dialog">
        <DialogHeader>
          <DialogTitle>
            {plan ? "Новая версия тарифа" : "Новый тариф"}
          </DialogTitle>
          <DialogDescription>
            Новые условия применятся к следующим покупкам. Действующие
            абонементы сохранят свои условия.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const number = (key: string) => Number(f.get(key));
            mutation.mutate({
              slug: f.get("slug"),
              published: f.has("published"),
              terms: {
                title: f.get("title"),
                description: f.get("description"),
                priceMinor: Math.round(number("price") * 100),
                durationDays: number("durationDays"),
                visitLimit: unlimited ? null : number("visitLimit"),
                freezeQuotaDays: number("freezeQuotaDays"),
                activationWindowDays: number("activationWindowDays"),
                weekdays: f.getAll("weekdays").map(Number),
                startMinute: number("startMinute"),
                endMinute: number("endMinute"),
                workoutIds: f.getAll("workouts"),
                trainerIds: f.getAll("trainers"),
                hallIds: f.getAll("halls"),
              },
            });
          }}
        >
          <div className="editor-grid">
            <div className="field">
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                name="title"
                required
                minLength={2}
                defaultValue={v?.title}
              />
            </div>
            <div className="field">
              <Label htmlFor="slug">Адрес тарифа (латиницей)</Label>
              <Input
                id="slug"
                name="slug"
                required
                pattern="[a-z0-9-]+"
                defaultValue={plan?.slug}
              />
            </div>
            <div className="field span-2">
              <Label htmlFor="description">Описание</Label>
              <textarea
                className="form-textarea"
                id="description"
                name="description"
                defaultValue={v?.description}
              />
            </div>
            <div className="field">
              <Label htmlFor="price">Стоимость, ₽</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min={1}
                step=".01"
                required
                defaultValue={v ? v.priceMinor / 100 : 4500}
              />
            </div>
            <div className="field">
              <Label htmlFor="durationDays">Срок действия, дней</Label>
              <Input
                id="durationDays"
                name="durationDays"
                type="number"
                min={1}
                max={730}
                required
                defaultValue={v?.durationDays ?? 30}
              />
            </div>
            <div className="field">
              <Label htmlFor="visitLimit">Количество посещений</Label>
              <Input
                id="visitLimit"
                name="visitLimit"
                type="number"
                min={1}
                disabled={unlimited}
                required={!unlimited}
                defaultValue={v?.visitLimit ?? 8}
              />
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => setUnlimited(e.target.checked)}
                />
                Безлимит
              </label>
            </div>
            <div className="field">
              <Label htmlFor="freezeQuotaDays">Дней заморозки</Label>
              <Input
                id="freezeQuotaDays"
                name="freezeQuotaDays"
                type="number"
                min={0}
                max={90}
                defaultValue={v?.freezeQuotaDays ?? 7}
              />
            </div>
            <div className="field">
              <Label htmlFor="activationWindowDays">
                Активация в течение, дней
              </Label>
              <Input
                id="activationWindowDays"
                name="activationWindowDays"
                type="number"
                min={0}
                max={30}
                defaultValue={v?.activationWindowDays ?? 30}
              />
            </div>
            <label className="inline-check">
              <input
                type="checkbox"
                name="published"
                defaultChecked={plan?.published ?? true}
              />
              Доступен для покупки
            </label>
          </div>
          <fieldset className="plan-rule">
            <legend>Дни и время занятий</legend>
            <div className="button-row">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <label key={day} className="inline-check">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={day}
                    defaultChecked={v ? v.weekdays.includes(day) : true}
                  />
                  {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][day]}
                </label>
              ))}
            </div>
            <div className="editor-grid">
              {[
                ["startMinute", "Начало", v?.startMinute ?? 0],
                ["endMinute", "Окончание", v?.endMinute ?? 1440],
              ].map(([key, label, initial]) => (
                <div className="field" key={key}>
                  <Label htmlFor={String(key)}>{label}</Label>
                  <select
                    className="form-select"
                    id={String(key)}
                    name={String(key)}
                    defaultValue={initial}
                  >
                    {Array.from({ length: 49 }, (_, i) => (
                      <option key={i} value={i * 30}>
                        {String(Math.floor(i / 2)).padStart(2, "0")}:
                        {i % 2 ? "30" : "00"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>
          {(["workouts", "trainers", "halls"] as const).map((kind) => (
            <fieldset className="plan-rule" key={kind}>
              <legend>
                {
                  {
                    workouts: "Направления",
                    trainers: "Тренеры",
                    halls: "Залы",
                  }[kind]
                }
              </legend>
              <p className="field-hint">
                Если ничего не выбрано — доступны все.
              </p>
              <div className="option-grid">
                {resources?.[kind]?.map((item) => (
                  <label className="inline-check" key={item.id}>
                    <input
                      name={kind}
                      value={item.id}
                      type="checkbox"
                      defaultChecked={v?.[kind].some((x) => x.id === item.id)}
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {mutation.error && (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          )}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button disabled={mutation.isPending}>Сохранить версию</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function Plans() {
  const qc = useQueryClient(),
    user = qc.getQueryData<User>(["me"]);
  const admin = user?.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined),
    [archiving, setArchiving] = useState<Plan | null>(null);
  const { data, error } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api<Plan[]>("/membership-plans"),
  });
  const archive = useMutation({
    mutationFn: (reason: string) =>
      post("/membership-plans/" + archiving?.id + "/archive", {
        version: archiving?.version,
        archived: !archiving?.archivedAt,
        reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plans"] });
      setArchiving(null);
      toast.success("Тариф обновлён");
    },
  });
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">УСЛОВИЯ КЛУБА</span>
          <h1>Тарифы и предложения</h1>
          <p>Версии условий для новых покупок.</p>
        </div>
        {admin && (
          <Button onClick={() => setEditing(null)}>
            <Plus size={18} />
            Новый тариф
          </Button>
        )}
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div className="plan-grid">
        {data?.map((plan) => {
          const v = plan.versions[0];
          if (!v) return null;
          return (
            <article
              className={"plan-card " + (plan.archivedAt ? "is-archived" : "")}
              key={plan.id}
            >
              <span className="eyebrow">
                {plan.archivedAt
                  ? "АРХИВ"
                  : plan.published
                    ? "ДОСТУПЕН ДЛЯ ПОКУПКИ"
                    : "СКРЫТ"}{" "}
                · ВЕРСИЯ {v.number}
              </span>
              <h2>{v.title}</h2>
              <p className="muted">{v.description}</p>
              <div className="plan-price">
                {money(v.priceMinor)}
                <span>/ {v.durationDays} дней</span>
              </div>
              <ul>
                <li>
                  <Check size={16} />
                  {v.visitLimit === null
                    ? "Безлимитные посещения"
                    : visits(v.visitLimit)}
                </li>
                <li>
                  <Check size={16} />
                  {v.freezeQuotaDays
                    ? v.freezeQuotaDays + " дней заморозки"
                    : "Без заморозки"}
                </li>
                <li>
                  <Check size={16} />
                  {v.workouts.length
                    ? v.workouts.map((w) => w.name).join(", ")
                    : "Все направления"}
                </li>
              </ul>
              {admin && (
                <div className="button-row">
                  {!plan.archivedAt && (
                    <Button variant="outline" onClick={() => setEditing(plan)}>
                      Изменить условия
                      <ArrowUpRight size={16} />
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setArchiving(plan)}>
                    {plan.archivedAt ? "Восстановить" : "В архив"}
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {data?.length === 0 && (
        <div className="empty-state">
          <h2>Добавьте первый тариф</h2>
          <p>Укажите стоимость, срок и правила посещения клуба.</p>
        </div>
      )}
      {editing !== undefined && (
        <PlanEditor
          plan={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
      <Dialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {archiving?.archivedAt
                ? "Восстановить тариф"
                : "Архивировать тариф"}
            </DialogTitle>
            <DialogDescription>
              Купленные абонементы сохраняют свои условия.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              archive.mutate(
                String(new FormData(e.currentTarget).get("reason")),
              );
            }}
          >
            <Label htmlFor="reason">Причина</Label>
            <Input id="reason" name="reason" required minLength={3} />
            {archive.error && (
              <p className="form-error">{archive.error.message}</p>
            )}
            <Button disabled={archive.isPending}>Подтвердить</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
