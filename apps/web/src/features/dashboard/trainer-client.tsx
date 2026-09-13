"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { states } from "@/features/programs/types";
import { bookingStatuses } from "@/features/bookings/types";
export function TrainerClient({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["trainer-client", id],
    queryFn: () =>
      api<{
        name: string;
        programAssignments: {
          id: string;
          status: string;
          programVersion: { title: string };
          _count: { logs: number };
        }[];
        bookings: {
          id: string;
          status: string;
          session: { startAt: string; workout: { name: string } };
        }[];
      }>("/trainer/clients/" + id),
  });
  return (
    <>
      <Link href="/trainer/clients" className="back-link">
        ← Мои клиенты
      </Link>
      {q.error ? (
        <p className="form-error">{q.error.message}</p>
      ) : !q.data ? (
        <p role="status">Открываем карточку…</p>
      ) : (
        <>
          <div className="page-heading">
            <span className="eyebrow">ИНДИВИДУАЛЬНАЯ РАБОТА</span>
            <h1>{q.data.name}</h1>
          </div>
          <div className="detail-grid">
            <section className="surface">
              <h2>Программы</h2>
              {q.data.programAssignments.map((a) => (
                <div className="detail-list" key={a.id}>
                  <div>
                    <Link
                      className="table-link"
                      href={"/trainer/assignments/" + a.id}
                    >
                      {a.programVersion.title}
                    </Link>
                    <span>
                      {states[a.status]} · выполнено занятий: {a._count.logs}
                    </span>
                  </div>
                </div>
              ))}
              {!q.data.programAssignments.length && (
                <p className="muted">Программ пока нет.</p>
              )}
              <Link className="table-link" href="/trainer/programs">
                Назначить из каталога{" "}
              </Link>
            </section>
            <section className="surface">
              <h2>Занятия со мной</h2>
              {q.data.bookings.map((b) => (
                <div className="detail-list" key={b.id}>
                  <div>
                    <Link
                      className="table-link"
                      href={"/trainer/bookings/" + b.id}
                    >
                      {b.session.workout.name}
                    </Link>
                    <span>
                      {dateTime(b.session.startAt)} ·{" "}
                      {bookingStatuses[b.status]}
                    </span>
                  </div>
                </div>
              ))}
              {!q.data.bookings.length && (
                <p className="muted">Записей пока нет.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
