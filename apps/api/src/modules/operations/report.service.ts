import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { Db } from "../../db";
import { type Tx, audit } from "../../common/transaction";
import { parse } from "../../common/validation";
import { fail } from "../../common/business-error";
import { areaPrincipal } from "../../common/area";
import type { Principal } from "../auth/access";
import { midnight, DAY } from "../memberships/membership.schema";
import { reportQuery } from "./operations.schema";
export type ReportFilters = z.infer<typeof reportQuery>;
export type ReportRow = Record<string, string | number | null>;
export interface Report {
  columns: { key: string; label: string }[];
  items: ReportRow[];
  total: number;
  summary: Record<string, number | null>;
  generatedAt: string;
}
const number = (v: unknown) => Number(v ?? 0);
@Injectable()
export class ReportService {
  constructor(private readonly db: Db) {}
  filters(auth: Principal, query: unknown) {
    const q = parse(reportQuery, query);
    auth = areaPrincipal(auth, q.area);
    const admin = auth.roles.some((r) => ["OWNER", "ADMIN"].includes(r)),
      reception = auth.roles.includes("RECEPTION"),
      trainer = auth.roles.includes("TRAINER");
    if (!admin && !reception && !trainer)
      fail("FORBIDDEN", "Отчёт недоступен", 403);
    if (!admin && reception && q.kind !== "FINANCE")
      fail(
        "FORBIDDEN",
        "Доступен отчёт по своим зарегистрированным оплатам",
        403,
      );
    if (
      trainer &&
      !admin &&
      !reception &&
      q.kind !== "ATTENDANCE" &&
      q.kind !== "RESOURCES"
    )
      fail("FORBIDDEN", "Доступна посещаемость своих занятий", 403);
    if (q.staffId && !admin && q.staffId !== auth.id)
      fail("FORBIDDEN", "Финансы другого сотрудника недоступны", 403);
    return { q, auth, admin, reception, trainer };
  }
  async run(auth: Principal, query: unknown) {
    const f = this.filters(auth, query);
    return this.db.$transaction((tx) => this.report(tx, f), {
      isolationLevel: "RepeatableRead",
      timeout: 30000,
    });
  }
  async report(
    tx: Tx,
    f: ReturnType<ReportService["filters"]>,
    limit = f.q.limit,
    offset = (f.q.page - 1) * f.q.limit,
  ): Promise<Report> {
    const { q, auth, admin, reception } = f,
      from = midnight(q.from),
      to = new Date(midnight(q.to).getTime() + DAY),
      generatedAt = new Date().toISOString();
    if (q.kind === "FINANCE") {
      const own = !admin && reception ? auth.id : q.staffId,
        staff = own ? Prisma.sql`AND o."createdBy"=${own}::uuid` : Prisma.empty,
        method = q.method ? Prisma.sql`AND p.method=${q.method}` : Prisma.empty;
      const ledger = Prisma.sql`WITH ledger AS (SELECT p.id,p.id AS "paymentId",'PAYMENT' AS kind,p."confirmedAt" AS date,c.name AS client,p.method,p."amountMinor" AS amount,o."productSnapshot"->>'title' AS title,u.name AS staff FROM "PaymentAttempt" p JOIN "Order" o ON o.id=p."orderId" JOIN "ClientProfile" c ON c.id=o."clientId" JOIN "User" u ON u.id=o."createdBy" WHERE p.status='SUCCEEDED' AND p."confirmedAt">=${from} AND p."confirmedAt"<${to} ${staff} ${method} UNION ALL SELECT r.id,p.id AS "paymentId",'REFUND' AS kind,r."completedAt" AS date,c.name AS client,p.method,-r."amountMinor" AS amount,o."productSnapshot"->>'title' AS title,u.name AS staff FROM "Refund" r JOIN "PaymentAttempt" p ON p.id=r."paymentId" JOIN "Order" o ON o.id=p."orderId" JOIN "ClientProfile" c ON c.id=o."clientId" JOIN "User" u ON u.id=r."requestedBy" WHERE r.status='SUCCEEDED' AND r."completedAt">=${from} AND r."completedAt"<${to} ${staff} ${method})`;
      const totals = await tx.$queryRaw<
        { total: bigint; income: bigint; refunds: bigint; net: bigint }[]
      >(
        Prisma.sql`${ledger} SELECT COUNT(*) AS total,COALESCE(SUM(amount) FILTER(WHERE kind='PAYMENT'),0) AS income,COALESCE(-SUM(amount) FILTER(WHERE kind='REFUND'),0) AS refunds,COALESCE(SUM(amount),0) AS net FROM ledger`,
      );
      const rows = await tx.$queryRaw<
          {
            id: string;
            paymentId: string;
            kind: string;
            date: Date;
            client: string;
            method: string;
            amount: number;
            title: string;
            staff: string;
          }[]
        >(
          Prisma.sql`${ledger} SELECT * FROM ledger ORDER BY date DESC,id LIMIT ${limit} OFFSET ${offset}`,
        ),
        total = totals[0]!;
      return {
        columns: [
          { key: "date", label: "Дата" },
          { key: "kind", label: "Операция" },
          { key: "client", label: "Клиент" },
          { key: "title", label: "Тариф" },
          { key: "method", label: "Способ" },
          { key: "amount", label: "Сумма, коп." },
          { key: "staff", label: "Сотрудник" },
        ],
        items: rows.map((r) => ({
          ...r,
          date: r.date.toISOString(),
          href: "/admin/payments/" + r.paymentId,
        })),
        total: number(total.total),
        summary: {
          incomeMinor: number(total.income),
          refundsMinor: number(total.refunds),
          netMinor: number(total.net),
        },
        generatedAt,
      };
    }
    const trainerId = !admin && !reception ? auth.trainerId! : q.trainerId,
      sessionWhere = {
        trainerId,
        hallId: q.hallId,
        workoutId: q.workoutId,
        startAt: { gte: from, lt: to },
      };
    if (q.kind === "ATTENDANCE") {
      const where = { session: sessionWhere },
        total = await tx.booking.count({ where }),
        counts = await tx.booking.groupBy({
          by: ["status"],
          where: { session: { ...sessionWhere, endAt: { lte: new Date() } } },
          _count: { _all: true },
        }),
        rows = await tx.booking.findMany({
          where,
          include: {
            client: { select: { name: true } },
            session: {
              include: {
                workout: { select: { name: true } },
                hall: { select: { name: true } },
                trainer: { select: { user: { select: { name: true } } } },
              },
            },
          },
          take: limit,
          skip: offset,
          orderBy: [{ session: { startAt: "desc" } }, { id: "asc" }],
        }),
        count = (s: string) =>
          counts.find((c) => c.status === s)?._count._all ?? 0,
        attended = count("ATTENDED"),
        noShow = count("NO_SHOW");
      return {
        columns: [
          { key: "date", label: "Дата" },
          { key: "client", label: "Клиент" },
          { key: "workout", label: "Занятие" },
          { key: "hall", label: "Зал" },
          { key: "trainer", label: "Тренер" },
          { key: "status", label: "Статус" },
        ],
        items: rows.map((r) => ({
          id: r.id,
          date: r.session.startAt.toISOString(),
          client: r.client.name,
          workout: r.session.workout.name,
          hall: r.session.hall.name,
          trainer: r.session.trainer.user.name,
          status: r.status,
          href: `/${!admin && !reception ? "trainer" : "admin"}/bookings/${r.id}`,
        })),
        total,
        summary: {
          attended,
          noShow,
          lateCancelled: count("CANCELLED_LATE"),
          attendanceRate:
            attended + noShow ? attended / (attended + noShow) : null,
        },
        generatedAt,
      };
    }
    if (q.kind === "RESOURCES") {
      const where = { ...sessionWhere, status: "PUBLISHED" },
        total = await tx.scheduledSession.count({ where }),
        rows = await tx.scheduledSession.findMany({
          where,
          include: {
            hall: { select: { name: true } },
            workout: { select: { name: true } },
            trainer: { select: { user: { select: { name: true } } } },
            bookings: {
              select: {
                status: true,
                events: {
                  select: { toStatus: true, createdAt: true },
                  orderBy: { createdAt: "desc" },
                },
              },
            },
          },
          orderBy: [{ startAt: "desc" }, { id: "asc" }],
          take: limit,
          skip: offset,
        });
      return {
        columns: [
          { key: "date", label: "Дата" },
          { key: "workout", label: "Занятие" },
          { key: "hall", label: "Зал" },
          { key: "trainer", label: "Тренер" },
          { key: "capacity", label: "Вместимость" },
          { key: "confirmed", label: "Мест сейчас" },
          { key: "atStart", label: "Записей к началу" },
          { key: "attended", label: "Посетили" },
        ],
        items: rows.map((s) => ({
          id: s.id,
          date: s.startAt.toISOString(),
          workout: s.workout.name,
          hall: s.hall.name,
          trainer: s.trainer.user.name,
          capacity: s.capacity,
          confirmed: s.bookings.filter((b) =>
            ["CONFIRMED", "ATTENDED", "NO_SHOW"].includes(b.status),
          ).length,
          atStart:
            s.startAt > new Date()
              ? null
              : s.bookings.filter((b) =>
                  ["CONFIRMED", "ATTENDED", "NO_SHOW"].includes(
                    b.events.find((e) => e.createdAt <= s.startAt)?.toStatus ??
                      "",
                  ),
                ).length,
          attended: s.bookings.filter((b) => b.status === "ATTENDED").length,
          href: `/${!admin && !reception ? "trainer" : "admin"}/bookings?sessionId=${s.id}`,
        })),
        total,
        summary: { sessions: total },
        generatedAt,
      };
    }
    const where = { endAt: { gte: from, lt: to }, cancelledAt: null },
      total = await tx.membership.count({ where }),
      rows = await tx.membership.findMany({
        where,
        include: { client: { select: { name: true } }, freezes: true },
        orderBy: [{ endAt: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      });
    const now = new Date();
    const active = await tx.membership.count({
        where: {
          startAt: { lte: now },
          endAt: { gt: now },
          cancelledAt: null,
          refundHold: false,
          freezes: {
            none: {
              status: "ACTIVE",
              startAt: { lte: now },
              endAt: { gt: now },
            },
          },
          OR: [
            { available: { gt: 0 } },
            {
              termsSnapshot: { path: ["visitLimit"], equals: Prisma.JsonNull },
            },
          ],
        },
      }),
      reservedOnly = await tx.membership.count({
        where: {
          startAt: { lte: now },
          endAt: { gt: now },
          cancelledAt: null,
          available: 0,
          reserved: { gt: 0 },
          refundHold: false,
          freezes: {
            none: {
              status: "ACTIVE",
              startAt: { lte: now },
              endAt: { gt: now },
            },
          },
        },
      });
    return {
      columns: [
        { key: "client", label: "Клиент" },
        { key: "title", label: "Абонемент" },
        { key: "date", label: "Окончание" },
        { key: "available", label: "Доступно" },
        { key: "reserved", label: "В резерве" },
      ],
      items: rows.map((m) => ({
        id: m.id,
        client: m.client.name,
        title: (m.termsSnapshot as { title: string }).title,
        date: new Date(m.endAt.getTime() - 1).toISOString(),
        available: m.available,
        reserved: m.reserved,
        href: "/admin/memberships/" + m.id,
      })),
      total,
      summary: { activeNow: active, reservedOnly, expiring: total },
      generatedAt,
    };
  }
  async exported(auth: Principal, query: unknown) {
    const f = this.filters(auth, query);
    return this.db.$transaction(
      async (tx) => {
        const first = await this.report(tx, f, 1000, 0);
        if (first.total > 50000)
          fail(
            "EXPORT_LIMIT",
            "Сузьте период: выгрузка ограничена 50 000 строками",
          );
        const items = [...first.items];
        for (let offset = 1000; offset < first.total; offset += 1000)
          items.push(...(await this.report(tx, f, 1000, offset)).items);
        await audit(tx, auth.id, "REPORT_EXPORTED", "Report", f.q.kind, {
          from: f.q.from,
          to: f.q.to,
          rows: items.length,
        });
        return { ...first, items };
      },
      { isolationLevel: "RepeatableRead", timeout: 60000 },
    );
  }
}
