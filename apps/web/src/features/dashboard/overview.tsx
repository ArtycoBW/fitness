"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ArrowUpRight, Users, Dumbbell } from "lucide-react";
import { api, type User } from "@/lib/api";
import { dateOnly, dateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Membership } from "@/features/memberships/memberships";
import type { Booking } from "@/features/bookings/types";
import { bookingStatuses } from "@/features/bookings/types";
import type { Area } from "@/features/programs/types";
import { useDebounced } from "@/lib/url-state";
interface Dashboard {
  area: Area;
  attended?: number;
  bookings?: Booking[];
  memberships?: Membership[];
  programs:
    | number
    | {
        id: string;
        programVersion: { title: string; _count: { days: number } };
        _count: { logs: number };
      }[];
  sessions?: {
    id: string;
    startAt: string;
    endAt: string;
    capacity: number;
    workout: { name: string };
    hall: { name: string };
    trainer: { user: { name: string } };
    _count: { bookings: number };
  }[];
  clients?: number;
  unmarked?: number;
}
export function Overview({ area }: { area: Area }) {
  const user = useQuery({
      queryKey: ["me"],
      queryFn: () => api<User>("/auth/me"),
    }),
    data = useQuery({
      queryKey: ["dashboard", area],
      queryFn: () => api<Dashboard>("/dashboard?area=" + area),
      refetchInterval: 15000,
    });
  const root = "/" + area;
  return (
    <>
      <div className="page-heading heading-actions">
        <div>
          <span className="eyebrow">
            {area === "account"
              ? "ВАШ РИТМ"
              : area === "trainer"
                ? "ВАШ ДЕНЬ"
                : "КЛУБ СЕГОДНЯ"}
          </span>
          <h1>Здравствуйте, {user.data?.name.split(" ")[0]}.</h1>
          <p>
            {dateOnly(new Date())} ·{" "}
            {area === "account"
              ? "Продолжайте в своём темпе."
              : "Всё необходимое для работы с клубом."}
          </p>
        </div>
        <Button asChild>
          <Link href={area === "account" ? "/schedule" : root + "/schedule"}>
            <CalendarDays size={17} />
            Расписание
          </Link>
        </Button>
      </div>
      {data.error ? (
        <div className="surface form-error">
          {data.error.message}
          <Button variant="ghost" onClick={() => void data.refetch()}>
            Повторить
          </Button>
        </div>
      ) : !data.data ? (
        <p role="status">Собираем ваш день…</p>
      ) : area === "account" ? (
        <ClientOverview data={data.data} />
      ) : (
        <>
          <div className="overview-stats">
            <Stat
              icon={<CalendarDays />}
              label="Занятий сегодня"
              value={data.data.sessions?.length ?? 0}
              href={root + "/schedule"}
            />
            <Stat
              icon={<Users />}
              label={area === "trainer" ? "Мои клиенты" : "Клиенты клуба"}
              value={data.data.clients ?? 0}
              href={root + "/clients"}
            />
            <Stat
              icon={<Dumbbell />}
              label="Ожидают отметки"
              value={data.data.unmarked ?? 0}
              href={root + "/bookings?upcoming=false"}
            />
          </div>
          {area === "admin" && <ReceptionSearch />}
          <section className="surface mt-6">
            <div className="heading-actions">
              <h2>Сегодня в расписании</h2>
              <Link className="table-link" href={root + "/schedule"}>
                Весь календарь →
              </Link>
            </div>
            {data.data.sessions?.length ? (
              data.data.sessions.map((s) => (
                <article className="overview-session" key={s.id}>
                  <time>{dateTime(s.startAt)}</time>
                  <div>
                    <strong>{s.workout.name}</strong>
                    <p className="muted">
                      {s.hall.name} · {s.trainer.user.name}
                    </p>
                  </div>
                  <span>
                    {s._count.bookings} / {s.capacity}
                  </span>
                  <Button asChild variant="outline">
                    <Link href={`${root}/bookings?sessionId=${s.id}`}>
                      Участники
                    </Link>
                  </Button>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <h3>На сегодня занятий нет</h3>
                <p>Другие даты доступны в расписании.</p>
              </div>
            )}
          </section>
          {(area === "trainer" ||
            user.data?.roles.some((r) => ["OWNER", "ADMIN"].includes(r))) && (
            <section className="surface mt-6 heading-actions">
              <div>
                <h2>Программы клиентов</h2>
                <p className="muted">
                  В работе:{" "}
                  {typeof data.data.programs === "number"
                    ? data.data.programs
                    : 0}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={root + "/assignments?status=ACTIVE"}>
                  Посмотреть прогресс
                </Link>
              </Button>
            </section>
          )}
        </>
      )}
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="surface overview-stat">
      <div>
        {icon}
        <ArrowUpRight size={16} />
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
    </Link>
  );
}
function ClientOverview({ data }: { data: Dashboard }) {
  return (
    <>
      <section className="surface">
        <div className="heading-actions">
          <h2>Ближайшие занятия</h2>
          <Link className="table-link" href="/account/bookings">
            Мои записи →
          </Link>
        </div>
        {data.bookings?.length ? (
          data.bookings.map((b) => (
            <article className="overview-session" key={b.id}>
              <time>{dateTime(b.session.startAt)}</time>
              <div>
                <strong>{b.session.workout.name}</strong>
                <p className="muted">
                  {b.session.hall.name} · {b.session.trainer.user.name}
                </p>
              </div>
              <span className="status-pill">{bookingStatuses[b.status]}</span>
              <Button asChild variant="outline">
                <Link href={"/account/bookings/" + b.id}>Открыть</Link>
              </Button>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <CalendarDays size={26} />
            <h2>Выберите время для себя</h2>
            <p>В расписании есть занятия разного темпа и уровня.</p>
            <Button asChild>
              <Link href="/schedule">Найти занятие</Link>
            </Button>
          </div>
        )}
      </section>
      <div className="detail-grid mt-6">
        <section className="surface">
          <div className="heading-actions">
            <h2>Ваши абонементы</h2>
            <Link className="table-link" href="/account/memberships">
              Все →
            </Link>
          </div>
          {data.memberships?.length ? (
            data.memberships.map((m) => (
              <Link
                className="overview-membership"
                href={"/account/memberships/" + m.id}
                key={m.id}
              >
                <strong>{m.termsSnapshot.title}</strong>
                <span>
                  {m.termsSnapshot.visitLimit === null
                    ? "Без ограничения посещений"
                    : `${m.available} доступно · ${m.reserved} в резерве`}
                </span>
                <span className="muted">До {dateOnly(m.endAt)}</span>
              </Link>
            ))
          ) : (
            <p className="muted">Активных абонементов пока нет.</p>
          )}
          <Button asChild variant="outline">
            <Link href="/memberships">Выбрать абонемент</Link>
          </Button>
        </section>
        <section className="surface">
          <h2>Движение к цели</h2>
          <p className="muted mb-5">Посещено занятий: {data.attended ?? 0}</p>
          {Array.isArray(data.programs) && data.programs.length ? (
            data.programs.map((p) => (
              <Link
                key={p.id}
                className="overview-membership"
                href={"/account/programs/" + p.id}
              >
                <strong>{p.programVersion.title}</strong>
                <div className="program-progress">
                  <progress
                    aria-label="Выполнение программы"
                    max={p.programVersion._count.days}
                    value={p._count.logs}
                  />
                  <span>
                    {p._count.logs} из {p.programVersion._count.days}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p>Тренер поможет составить персональный план.</p>
          )}
          <Link className="table-link" href="/account/programs">
            Мои программы →
          </Link>
        </section>
      </div>
    </>
  );
}
function ReceptionSearch() {
  const [q, setQ] = useState(""),
    search = useDebounced(q),
    clients = useQuery({
      queryKey: ["reception-search", search],
      queryFn: () =>
        api<{ items: { id: string; name: string; phone: string | null }[] }>(
          "/catalog/clients?limit=5&q=" + encodeURIComponent(search),
        ),
      enabled: search.trim().length >= 2,
    });
  return (
    <section className="surface mt-6">
      <div className="heading-actions">
        <h2>Найти клиента</h2>
        <Button asChild variant="outline">
          <Link href="/admin/payments?sale=true">Оформить продажу</Link>
        </Button>
      </div>
      <Input
        aria-label="Быстрый поиск клиента"
        placeholder="Имя, телефон или email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {clients.error && <p className="form-error">{clients.error.message}</p>}
      {clients.data?.items.map((c) => (
        <div className="overview-session" key={c.id}>
          <div>
            <Link className="table-link" href={"/admin/clients/" + c.id}>
              {c.name}
            </Link>
            <p className="muted">{c.phone}</p>
          </div>
          <Button asChild variant="ghost">
            <Link href={"/admin/memberships?clientId=" + c.id}>Абонементы</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={"/admin/payments?sale=true&clientId=" + c.id}>
              Продажа
            </Link>
          </Button>
        </div>
      ))}
      {search.length >= 2 && clients.data && !clients.data.items.length && (
        <p className="muted mt-4">
          Клиент не найден.{" "}
          <Link href="/admin/clients">Создать карточку →</Link>
        </p>
      )}
    </section>
  );
}
