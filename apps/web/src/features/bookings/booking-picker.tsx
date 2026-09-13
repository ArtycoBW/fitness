"use client";

import { SelectField } from "@/components/ui/select-field";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post, ApiError, type User } from "@/lib/api";
import { dateOnly, visits } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Session } from "@/features/schedule/types";
import { bookingStatuses, type Booking } from "./types";
interface Options {
  reason: string | null;
  profileRequired?: boolean;
  waitlistRequired?: boolean;
  canWaitlist?: boolean;
  waitlistDeadlineMinutes?: number;
  existing: Booking | null;
  memberships: {
    id: string;
    title: string;
    endAt: string;
    available: number;
    unlimited: boolean;
    reason: string | null;
  }[];
}
export function BookingPicker({ session: s }: { session: Session }) {
  const fieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const path = usePathname();
  const qc = useQueryClient(),
    { data: user } = useQuery({
      queryKey: ["me"],
      queryFn: () => api<User>("/auth/me"),
      retry: false,
    }),
    staff =
      path.startsWith("/admin") &&
      user?.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r)),
    [clientId, setClient] = useState(""),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  const target = staff ? clientId : user?.clientId;
  const { data: clients } = useQuery({
    queryKey: ["booking-clients", q],
    queryFn: () =>
      api<{ items: { id: string; name: string }[] }>(
        "/catalog/clients?limit=100&q=" + encodeURIComponent(q),
      ),
    enabled: !!staff,
  });
  const { data: options, error } = useQuery({
    queryKey: ["booking-options", s.id, target],
    queryFn: () =>
      api<Options>(
        "/sessions/" +
          s.id +
          "/booking-options" +
          (staff ? "?clientId=" + clientId : ""),
      ),
    enabled: !!target,
    refetchInterval: 10000,
  });
  const save = useMutation({
    mutationFn: (waitlist: boolean) =>
      post<Booking>(
        "/bookings",
        {
          sessionId: s.id,
          membershipId:
            selected || options?.memberships.find((m) => !m.reason)?.id,
          waitlist,
          ...(staff ? { clientId } : {}),
        },
        key +
          ":" +
          String(waitlist) +
          ":" +
          (selected || "first") +
          ":" +
          target,
      ),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: ["booking-options"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["bookings"] });
      void qc.invalidateQueries({ queryKey: ["memberships"] });
      toast.success(
        b.status === "WAITLISTED"
          ? "Вы добавлены в очередь"
          : "Запись подтверждена",
      );
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["booking-options"] });
    },
  });
  if (!user)
    return (
      <Button asChild>
        <Link
          href={
            "/login?next=" + encodeURIComponent("/schedule?session=" + s.id)
          }
        >
          Войти и записаться
        </Link>
      </Button>
    );
  if (!staff && !user.clientId)
    return <p className="muted">Запись клиентов доступна на рецепции.</p>;
  const existing = options?.existing,
    member = options?.memberships.find(
      (m) =>
        m.id === (selected || options.memberships.find((m) => !m.reason)?.id),
    );
  const queueError =
    save.error instanceof ApiError &&
    ["SESSION_FULL", "WAITLIST_PRIORITY"].includes(save.error.code);
  const waiting =
    options?.waitlistRequired ?? (s.freePlaces === 0 || queueError);
  return (
    <section className="booking-picker">
      {staff && (
        <div className="form-stack">
          <Label htmlFor="booking-search">Найти клиента</Label>
          <Input
            id="booking-search"
            placeholder="Имя или телефон"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <SelectField
            aria-label="Клиент для записи"
            className="form-select"
            value={clientId}
            onChange={(e) => {
              setClient(e.target.value);
              setSelected("");
              save.reset();
            }}
          >
            <option value="">Выберите клиента</option>
            {clients?.items.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {error && <p className="form-error">{error.message}</p>}
      {options?.reason && (
        <p className="form-error">
          {options.reason}
          {!staff && options.profileRequired && (
            <>
              {" "}
              <Link href="/account/profile">Открыть профиль</Link>
            </>
          )}
        </p>
      )}
      {existing &&
      ["CONFIRMED", "WAITLISTED", "ATTENDED", "NO_SHOW"].includes(
        existing.status,
      ) ? (
        <div className="notice">
          <strong>{bookingStatuses[existing.status]}</strong>
          <p>
            {existing.status === "WAITLISTED"
              ? "Посещение не списано. Если место освободится, мы сообщим о подтверждении."
              : "Занятие сохранено в вашем расписании."}
          </p>
          <Link
            className="table-link"
            href={(staff ? "/admin" : "/account") + "/bookings/" + existing.id}
          >
            Подробности записи{" "}
          </Link>
        </div>
      ) : options && !options.reason ? (
        <>
          <h3 id={fieldId}>Выберите абонемент</h3>
          <RadioGroup
            className="membership-options"
            aria-labelledby={fieldId}
            value={member?.id ?? ""}
            onValueChange={(id) => {
              setSelected(id);
              save.reset();
            }}
          >
            {[...options.memberships]
              .sort((a, b) => Number(!!a.reason) - Number(!!b.reason))
              .filter((m, i) => expanded || i < 3 || m.id === member?.id)
              .map((m) => (
                <label
                  className={
                    "membership-option " +
                    (member?.id === m.id ? "is-selected" : "") +
                    (m.reason ? " is-disabled" : "")
                  }
                  key={m.id}
                >
                  <RadioGroupItem
                    value={m.id}
                    aria-label={m.title}
                    disabled={!!m.reason}
                  />
                  <span>
                    <strong>{m.title}</strong>
                    <small>
                      {m.reason ??
                        (m.unlimited ? "Безлимит" : visits(m.available)) +
                          " · до " +
                          dateOnly(m.endAt)}
                    </small>
                  </span>
                </label>
              ))}
          </RadioGroup>
          {options.memberships.length > 3 && (
            <Button
              className="membership-expand"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              {expanded
                ? "Свернуть список"
                : `Все абонементы (${options.memberships.length})`}
            </Button>
          )}
          {!options.memberships.some((m) => !m.reason) && (
            <div className="notice">
              <p>Для этого занятия нужен подходящий абонемент.</p>
              <Link className="table-link" href="/memberships">
                Выбрать абонемент{" "}
              </Link>
            </div>
          )}
          {member && !member.reason && (
            <>
              <p className="field-hint">
                {waiting
                  ? `Очередь не расходует посещение. Если место освободится, запись подтвердится автоматически. Автоподтверждение прекращается за ${options.waitlistDeadlineMinutes ?? Math.max(s.policySnapshot.waitlistCutoffMinutes, s.policySnapshot.cancelMinutes, s.policySnapshot.bookingCloseMinutes)} мин до начала.`
                  : member.unlimited
                    ? "Занятие входит в ваш безлимитный абонемент. Если планы изменятся, отмените запись, чтобы освободить место."
                    : existing?.status === "CANCELLED_LATE"
                      ? "Восстановим запись с ранее удержанным посещением. Повторного списания не будет."
                      : `Одно посещение будет зарезервировано до занятия. Отмена с возвратом посещения — не позднее чем за ${s.policySnapshot.cancelMinutes} мин до начала.`}
              </p>
              {save.error && <p className="form-error">{save.error.message}</p>}
              <Button
                className="w-full"
                disabled={save.isPending}
                onClick={() => save.mutate(waiting)}
              >
                {save.isPending
                  ? "Сохраняем…"
                  : waiting
                    ? "Встать в очередь"
                    : "Подтвердить запись"}
              </Button>
            </>
          )}
        </>
      ) : !target ? null : !options && !error ? (
        <p role="status">Проверяем абонементы…</p>
      ) : null}
    </section>
  );
}
