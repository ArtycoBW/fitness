import { Injectable, Module } from "@nestjs/common";
import { Db } from "../../db";
import { fail } from "../../common/business-error";
import { atomic, audit, type Tx } from "../../common/transaction";
import { areaPrincipal } from "../../common/area";
import {
  parse,
  uuid,
  listQuery,
  reason,
  version,
} from "../../common/validation";
import { idempotent } from "../../common/idempotency";
import { notifyUser } from "../notifications/notification.service";
import { z } from "zod";
import type { Principal } from "../auth/access";
import type { Booking, ScheduledSession } from "../../generated/prisma/client";
import { EntitlementService } from "../memberships/entitlement.service";
import { policySchema } from "../schedule/schedule.schema";
import {
  bookSchema,
  cancelBookingSchema,
  attendanceSchema,
} from "./booking.schema";
const occupying = ["CONFIRMED", "ATTENDED", "NO_SHOW"],
  staff = (a: Principal) =>
    a.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r)),
  admin = (a: Principal) => a.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
const detailInclude = {
  client: { select: { id: true, name: true } },
  session: {
    include: {
      workout: { select: { name: true, category: true } },
      trainer: { select: { id: true, user: { select: { name: true } } } },
      hall: { select: { name: true } },
    },
  },
  membership: { select: { id: true, termsSnapshot: true } },
} as const;
@Injectable()
export class BookingCore {
  private readonly rights = new EntitlementService();
  constructor(private readonly db: Db) {}
  async locks(tx: Tx, clients: string[], sessions: string[]) {
    for (const id of [...new Set(clients)].sort())
      await tx.$queryRaw`SELECT id FROM "ClientProfile" WHERE id=${id}::uuid FOR UPDATE`;
    for (const id of [...new Set(sessions)].sort())
      await tx.$queryRaw`SELECT id FROM "ScheduledSession" WHERE id=${id}::uuid FOR UPDATE`;
  }
  async session(tx: Tx, id: string) {
    const s = await tx.scheduledSession.findUnique({ where: { id } });
    if (!s) fail("NOT_FOUND", "Занятие не найдено", 404);
    return s;
  }
  scope(
    auth: Principal,
    b: { clientId: string; session?: { trainerId: string } },
    roster = false,
  ) {
    if (
      !staff(auth) &&
      auth.clientId !== b.clientId &&
      !(roster && auth.trainerId && auth.trainerId === b.session?.trainerId)
    )
      fail("NOT_FOUND", "Запись не найдена", 404);
  }
  open(s: ScheduledSession, now = new Date()) {
    const policy = parse(policySchema, s.policySnapshot);
    if (s.status !== "PUBLISHED" || s.startAt <= now)
      fail("BOOKING_CLOSED", "Запись на занятие закрыта");
    const until = s.startAt.getTime() - now.getTime();
    if (until > policy.bookingOpenDays * 86400000)
      fail("BOOKING_NOT_OPEN", "Запись на это занятие ещё не открылась");
    if (until < policy.bookingCloseMinutes * 60000)
      fail("BOOKING_CLOSED", "Время записи истекло");
    return policy;
  }
  async clientReason(tx: Tx, id: string, self = false) {
    const c = await tx.clientProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (
      !c ||
      c.archivedAt ||
      c.status !== "ACTIVE" ||
      c.visitsBlocked ||
      c.user?.status === "BLOCKED"
    )
      return "Посещения для клиента недоступны";
    if (self && !c.phone) return "Для записи добавьте контактный телефон";
    return null;
  }
  async conflict(
    tx: Tx,
    clientId: string,
    s: Pick<ScheduledSession, "startAt" | "endAt">,
    exclude: string[] = [],
  ) {
    return tx.clientOccupancy.findFirst({
      where: {
        clientId,
        active: true,
        bookingId: { notIn: exclude },
        startAt: { lt: s.endAt },
        endAt: { gt: s.startAt },
      },
    });
  }
  async notify(tx: Tx, b: Booking, title: string, reasonText?: string) {
    const c = await tx.clientProfile.findUnique({
      where: { id: b.clientId },
      include: { user: true },
    });
    if (!c?.userId || !c.user) return;
    const s = await tx.scheduledSession.findUniqueOrThrow({
      where: { id: b.sessionId },
      include: { workout: true },
    });
    const date = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(s.startAt);
    const text =
      s.workout.name + " · " + date + (reasonText ? "\n" + reasonText : "");
    const eventKey = "booking:" + b.id + ":" + b.version + ":" + b.status;
    await notifyUser(tx, c.userId, {
      type: "BOOKING",
      title,
      text,
      href: "/account/bookings/" + b.id,
      eventKey,
    });
  }
  async transition(
    tx: Tx,
    b: Booking,
    status: string,
    balance: "NONE" | "RESERVED" | "CONSUMED",
    actorId?: string,
    why?: string,
  ) {
    const eventKey = "booking:" + b.id + ":" + (b.version + 1);
    if (b.balanceState !== balance) {
      if (b.balanceState === "RESERVED")
        await this.rights.movement(
          tx,
          b.membershipId,
          balance === "CONSUMED" ? "CONSUME" : "RELEASE",
          eventKey + ":release",
          actorId,
          b.id,
          undefined,
          why,
        );
      if (b.balanceState === "CONSUMED")
        await this.rights.movement(
          tx,
          b.membershipId,
          "RESTORE",
          eventKey + ":restore",
          actorId,
          b.id,
          undefined,
          why,
        );
      if (balance === "RESERVED")
        await this.rights.movement(
          tx,
          b.membershipId,
          "RESERVE",
          eventKey + ":reserve",
          actorId,
          b.id,
          undefined,
          why,
        );
      if (balance === "CONSUMED" && b.balanceState === "NONE") {
        await this.rights.movement(
          tx,
          b.membershipId,
          "RESERVE",
          eventKey + ":reserve",
          actorId,
          b.id,
          undefined,
          why,
        );
        await this.rights.movement(
          tx,
          b.membershipId,
          "CONSUME",
          eventKey + ":consume",
          actorId,
          b.id,
          undefined,
          why,
        );
      }
    }
    const updated = await tx.booking.update({
      where: { id: b.id },
      data: {
        status,
        balanceState: balance,
        version: { increment: 1 },
        reason: why ?? null,
        ...(status === "ATTENDED" || status === "NO_SHOW"
          ? { attendanceAt: new Date() }
          : {}),
        ...(status === "WAITLISTED" ? { queuedAt: new Date() } : {}),
      },
    });
    const s = await this.session(tx, b.sessionId);
    if (occupying.includes(status))
      await tx.clientOccupancy.upsert({
        where: { bookingId: b.id },
        create: {
          clientId: b.clientId,
          bookingId: b.id,
          startAt: s.startAt,
          endAt: s.endAt,
        },
        update: { startAt: s.startAt, endAt: s.endAt, active: true },
      });
    else
      await tx.clientOccupancy.updateMany({
        where: { bookingId: b.id },
        data: { active: false },
      });
    await tx.bookingEvent.create({
      data: {
        bookingId: b.id,
        eventKey,
        fromStatus: b.status,
        toStatus: status,
        actorId,
        reason: why,
      },
    });
    if (actorId)
      await audit(
        tx,
        actorId,
        "BOOKING_" + status,
        "Booking",
        b.id,
        { membershipId: b.membershipId },
        why,
      );
    await this.notify(
      tx,
      updated,
      {
        CONFIRMED:
          b.status === "WAITLISTED"
            ? "Место на занятии освободилось"
            : "Вы записаны на занятие",
        WAITLISTED: "Вы в очереди ожидания",
        CANCELLED_ON_TIME: "Запись отменена",
        CANCELLED_LATE: "Запись отменена с удержанием посещения",
        CANCELLED_BY_CLUB: "Занятие отменено клубом",
        WAITLIST_SKIPPED: "Место не удалось подтвердить",
        WAITLIST_EXPIRED: "Очередь на занятие завершена",
        ATTENDED: "Посещение отмечено",
        NO_SHOW: "Отмечена неявка",
      }[status] ?? "Запись обновлена",
      why,
    );
    return updated;
  }
  async book(auth: Principal, body: unknown, key?: string) {
    if (!parse(bookSchema, body).clientId && auth.roles.includes("CLIENT"))
      auth = areaPrincipal(auth, "account");
    const dto = parse(bookSchema, body),
      clientId = staff(auth) ? dto.clientId : auth.clientId;
    if (!clientId) fail("CLIENT_REQUIRED", "Выберите клиента", 400);
    if (!staff(auth) && dto.clientId && dto.clientId !== auth.clientId)
      fail("NOT_FOUND", "Клиент не найден", 404);
    return idempotent(
      this.db,
      auth.id,
      "booking-create",
      key,
      dto,
      async (tx) => {
        await this.locks(tx, [clientId], [dto.sessionId]);
        const s = await this.session(tx, dto.sessionId),
          policy = this.open(s),
          clientIssue = await this.clientReason(tx, clientId, !staff(auth));
        if (clientIssue) fail("CLIENT_UNAVAILABLE", clientIssue, 409);
        let existing = await tx.booking.findUnique({
          where: { clientId_sessionId: { clientId, sessionId: s.id } },
        });
        if (
          existing?.status === "WAITLISTED" &&
          s.startAt.getTime() - Date.now() <=
            policy.waitlistCutoffMinutes * 60000
        )
          existing = await this.transition(
            tx,
            existing,
            "WAITLIST_EXPIRED",
            "NONE",
            auth.id,
            "Автоподтверждение завершено",
          );
        if (existing && ["CONFIRMED", "WAITLISTED"].includes(existing.status))
          return existing;
        if (
          existing &&
          ["ATTENDED", "NO_SHOW", "CANCELLED_BY_CLUB"].includes(existing.status)
        )
          fail("BOOKING_FINISHED", "Запись завершена");
        const m = await this.rights.lock(tx, dto.membershipId);
        if (m.clientId !== clientId)
          fail("NOT_FOUND", "Абонемент не найден", 404);
        if (
          existing?.status === "CANCELLED_LATE" &&
          existing.membershipId !== m.id
        )
          fail(
            "MEMBERSHIP_FIXED",
            "Восстановите запись с первоначальным абонементом",
          );
        const entitlementIssue = this.rights.eligibility(m, s);
        if (entitlementIssue)
          fail("ENTITLEMENT_UNAVAILABLE", entitlementIssue, 409);
        if (await this.conflict(tx, clientId, s, existing ? [existing.id] : []))
          fail("CLIENT_CONFLICT", "В это время у клиента уже есть занятие");
        const restoring = existing?.balanceState === "CONSUMED";
        if (
          !restoring &&
          this.rights.terms(m).visitLimit !== null &&
          m.available < 1
        )
          fail("INSUFFICIENT_CREDITS", "Нет свободных посещений");
        const count = await tx.booking.count({
            where: { sessionId: s.id, status: { in: occupying } },
          }),
          cutoff =
            s.startAt.getTime() - Date.now() <=
            policy.waitlistCutoffMinutes * 60000;
        const queue =
          !cutoff &&
          (await tx.booking.count({
            where: { sessionId: s.id, status: "WAITLISTED" },
          })) > 0;
        if ((count >= s.capacity || queue) && !dto.waitlist)
          fail(
            queue ? "WAITLIST_PRIORITY" : "SESSION_FULL",
            queue
              ? "Место предлагается участникам очереди"
              : "Свободных мест больше нет",
            409,
            {
              freePlaces: Math.max(0, s.capacity - count),
              canWaitlist: !cutoff,
            },
          );
        const waiting = count >= s.capacity || queue;
        if (waiting && cutoff)
          fail("WAITLIST_CLOSED", "Очередь ожидания уже закрыта");
        if (waiting && restoring)
          fail(
            "SESSION_FULL",
            "Для восстановления поздней отмены дождитесь свободного места",
          );
        if (!existing)
          existing = await tx.booking.create({
            data: {
              clientId,
              sessionId: s.id,
              membershipId: m.id,
              status: "NEW",
            },
          });
        else if (existing.membershipId !== m.id)
          existing = await tx.booking.update({
            where: { id: existing.id },
            data: { membershipId: m.id },
          });
        return this.transition(
          tx,
          existing,
          waiting ? "WAITLISTED" : "CONFIRMED",
          waiting ? "NONE" : "RESERVED",
          auth.id,
          restoring ? "Восстановление записи после поздней отмены" : undefined,
        );
      },
    );
  }
  async options(auth: Principal, sessionId: string, clientId?: string) {
    if (!clientId && auth.roles.includes("CLIENT"))
      auth = areaPrincipal(auth, "account");
    parse(uuid, sessionId);
    if (clientId) parse(uuid, clientId);
    const target = staff(auth) ? clientId : auth.clientId;
    if (!target)
      return { memberships: [], existing: null, reason: "Выберите клиента" };
    return atomic(this.db, async (tx) => {
      const s = await this.session(tx, sessionId);
      if (s.status === "DRAFT") fail("NOT_FOUND", "Занятие не найдено", 404);
      const ms = await tx.membership.findMany({
          where: { clientId: target },
          include: { freezes: true },
          orderBy: { endAt: "asc" },
        }),
        existing = await tx.booking.findUnique({
          where: { clientId_sessionId: { clientId: target, sessionId } },
        });
      return {
        reason: await this.clientReason(tx, target, !staff(auth)),
        existing,
        memberships: ms.map((m) => ({
          id: m.id,
          title: this.rights.terms(m).title,
          endAt: m.endAt,
          available: m.available,
          unlimited: this.rights.terms(m).visitLimit === null,
          reason:
            this.rights.eligibility(m, s) ??
            (this.rights.terms(m).visitLimit !== null &&
            m.available < 1 &&
            !(
              existing?.membershipId === m.id &&
              existing.balanceState === "CONSUMED"
            )
              ? "Нет свободных посещений"
              : null),
        })),
      };
    });
  }
  async cancelCalculation(tx: Tx, auth: Principal, id: string) {
    const b = await tx.booking.findUnique({
      where: { id },
      include: { session: true },
    });
    if (!b) fail("NOT_FOUND", "Запись не найдена", 404);
    this.scope(auth, b);
    await this.locks(tx, [b.clientId], [b.sessionId]);
    if (!["WAITLISTED", "CONFIRMED"].includes(b.status))
      fail("BOOKING_FINISHED", "Запись уже завершена");
    if (b.session.startAt <= new Date())
      fail("CANCEL_CLOSED", "После начала занятия обратитесь к сотруднику");
    const p = parse(policySchema, b.session.policySnapshot),
      late =
        b.status === "CONFIRMED" &&
        b.session.startAt.getTime() - Date.now() < p.cancelMinutes * 60000;
    return { b, late };
  }
  async cancelPreview(auth: Principal, id: string) {
    parse(uuid, id);
    return atomic(this.db, async (tx) => {
      const { b, late } = await this.cancelCalculation(tx, auth, id);
      return {
        version: b.version,
        late,
        message: late
          ? "При отмене будет списано одно посещение"
          : b.status === "WAITLISTED"
            ? "Вы покинете очередь, посещение не списывается"
            : "Посещение вернётся в доступный остаток",
      };
    });
  }
  async cancel(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(cancelBookingSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "booking-cancel:" + id,
      key,
      dto,
      async (tx) => {
        const { b, late } = await this.cancelCalculation(tx, auth, id);
        if (b.version !== dto.version)
          fail("VERSION_CONFLICT", "Запись изменилась. Обновите данные");
        if (late && !dto.acceptLoss)
          fail(
            "LATE_CONFIRMATION",
            "Подтвердите отмену со списанием посещения",
          );
        return this.transition(
          tx,
          b,
          late ? "CANCELLED_LATE" : "CANCELLED_ON_TIME",
          late ? "CONSUMED" : "NONE",
          auth.id,
          dto.reason,
        );
      },
    );
  }
  async attendance(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(attendanceSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "attendance:" + id,
      key,
      dto,
      async (tx) => {
        const initial = await tx.booking.findUnique({
          where: { id },
          include: { session: true },
        });
        if (!initial) fail("NOT_FOUND", "Запись не найдена", 404);
        if (!staff(auth) && auth.trainerId !== initial.session.trainerId)
          fail("NOT_FOUND", "Занятие не найдено", 404);
        await this.locks(tx, [initial.clientId], [initial.sessionId]);
        const b = await tx.booking.findUniqueOrThrow({
          where: { id },
          include: { session: true },
        });
        if (b.version !== dto.version)
          fail("VERSION_CONFLICT", "Отметка уже изменилась");
        if (
          !["CONFIRMED", "ATTENDED", "NO_SHOW"].includes(b.status) ||
          b.session.status === "CANCELLED"
        )
          fail("BOOKING_FINISHED", "Эту запись нельзя отметить");
        const p = parse(policySchema, b.session.policySnapshot),
          now = Date.now(),
          outside =
            now <
              b.session.startAt.getTime() - p.attendanceBeforeMinutes * 60000 ||
            now > b.session.endAt.getTime() + p.attendanceAfterHours * 3600000;
        if (b.status === dto.status) return b;
        if (outside || b.status !== "CONFIRMED") {
          if (!admin(auth) || !dto.correction || !dto.reason)
            fail(
              "ATTENDANCE_WINDOW",
              "Для исправления отметки требуется администратор и причина",
            );
        }
        return this.transition(
          tx,
          b,
          dto.status,
          "CONSUMED",
          auth.id,
          dto.reason,
        );
      },
    );
  }
  async restore(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(z.strictObject({ reason, version }), body);
    return idempotent(
      this.db,
      auth.id,
      "booking-restore:" + id,
      key,
      dto,
      async (tx) => {
        const initial = await tx.booking.findUnique({ where: { id } });
        if (!initial) fail("NOT_FOUND", "Запись не найдена", 404);
        await this.locks(tx, [initial.clientId], [initial.sessionId]);
        const b = await tx.booking.findUniqueOrThrow({ where: { id } });
        if (b.version !== dto.version)
          fail("VERSION_CONFLICT", "Запись изменилась");
        if (b.balanceState !== "CONSUMED")
          fail("RESTORE_UNAVAILABLE", "Нет списанного посещения для возврата");
        return this.transition(
          tx,
          b,
          "CANCELLED_BY_CLUB",
          "NONE",
          auth.id,
          dto.reason,
        );
      },
    );
  }
  async list(auth: Principal, query: unknown) {
    auth = areaPrincipal(auth, parse(listQuery, query).area);
    const q = parse(
      listQuery.extend({
        clientId: uuid.optional(),
        sessionId: uuid.optional(),
        status: z.string().max(30).optional(),
        upcoming: z.enum(["true", "false"]).optional(),
      }),
      query,
    );
    const where = {
      ...(staff(auth)
        ? { clientId: q.clientId }
        : auth.roles.includes("TRAINER")
          ? {
              session: {
                trainerId:
                  auth.trainerId ?? "00000000-0000-0000-0000-000000000000",
              },
            }
          : {
              clientId: auth.clientId ?? "00000000-0000-0000-0000-000000000000",
            }),
      sessionId: q.sessionId,
      status: q.status,
      ...(q.upcoming === "true"
        ? {
            session: {
              ...(!staff(auth) && auth.roles.includes("TRAINER")
                ? { trainerId: auth.trainerId ?? "" }
                : {}),
              endAt: { gte: new Date() },
            },
          }
        : {}),
      client: { name: { contains: q.q, mode: "insensitive" as const } },
    };
    const [items, total] = await this.db.$transaction([
      this.db.booking.findMany({
        where,
        include: detailInclude,
        orderBy: {
          session: { startAt: q.upcoming === "true" ? "asc" : "desc" },
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.booking.count({ where }),
    ]);
    return { items, total };
  }
  async detail(auth: Principal, id: string) {
    parse(uuid, id);
    const b = await this.db.booking.findUnique({
      where: { id },
      include: { ...detailInclude, events: { orderBy: { createdAt: "desc" } } },
    });
    if (!b) fail("NOT_FOUND", "Запись не найдена", 404);
    this.scope(auth, b, true);
    return b;
  }
  async affected(tx: Tx, sessionIds: string[]) {
    const bs = await tx.booking.findMany({
      where: {
        sessionId: { in: sessionIds },
        status: {
          notIn: [
            "CANCELLED_BY_CLUB",
            "CANCELLED_ON_TIME",
            "WAITLIST_SKIPPED",
            "WAITLIST_EXPIRED",
          ],
        },
      },
    });
    await this.locks(
      tx,
      bs.map((b) => b.clientId),
      sessionIds,
    );
    for (const id of [...new Set(bs.map((b) => b.membershipId))].sort())
      await this.rights.lock(tx, id);
    return bs;
  }
  async validateMove(
    tx: Tx,
    rows: Array<{
      old: ScheduledSession;
      slot: Pick<
        ScheduledSession,
        "startAt" | "endAt" | "workoutId" | "trainerId" | "hallId" | "capacity"
      >;
    }>,
    bs: Booking[],
  ) {
    const ids = bs.map((b) => b.id);
    for (const row of rows) {
      const active = bs.filter(
        (b) => b.sessionId === row.old.id && occupying.includes(b.status),
      );
      if (active.length > row.slot.capacity)
        fail("CAPACITY_BOOKED", "Вместимость меньше числа записанных клиентов");
      for (const b of active) {
        const m = await this.rights.lock(tx, b.membershipId),
          why = this.rights.eligibility(m, row.slot);
        if (why)
          fail("BOOKING_ENTITLEMENT", "Перенос недоступен: " + why, 409, {
            bookingId: b.id,
            clientId: b.clientId,
          });
        if (await this.conflict(tx, b.clientId, row.slot, ids))
          fail(
            "CLIENT_CONFLICT",
            "Перенос пересекается с другим занятием клиента",
            409,
            { bookingId: b.id, clientId: b.clientId },
          );
        const overlapping = rows.some(
          (other) =>
            other.old.id !== row.old.id &&
            other.slot.startAt < row.slot.endAt &&
            other.slot.endAt > row.slot.startAt &&
            bs.some(
              (x) =>
                x.sessionId === other.old.id &&
                x.clientId === b.clientId &&
                occupying.includes(x.status),
            ),
        );
        if (overlapping)
          fail("CLIENT_CONFLICT", "Занятия серии пересекаются у клиента");
      }
    }
  }
  async moveOccupancy(tx: Tx, bs: Booking[]) {
    await tx.clientOccupancy.updateMany({
      where: { bookingId: { in: bs.map((b) => b.id) } },
      data: { active: false },
    });
    for (const b of bs) {
      const s = await this.session(tx, b.sessionId);
      if (occupying.includes(b.status))
        await tx.clientOccupancy.updateMany({
          where: { bookingId: b.id },
          data: { startAt: s.startAt, endAt: s.endAt, active: true },
        });
      if (["CONFIRMED", "WAITLISTED"].includes(b.status)) {
        const updated = await tx.booking.update({
          where: { id: b.id },
          data: { version: { increment: 1 } },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: b.id,
            eventKey: "move:" + b.id + ":" + updated.version,
            fromStatus: b.status,
            toStatus: b.status,
            reason: "Занятие перенесено клубом",
          },
        });
        await this.notify(tx, updated, "Время или место занятия изменилось");
      }
    }
  }
  async cancelSessions(
    tx: Tx,
    sessionIds: string[],
    actorId: string,
    why: string,
  ) {
    const bs = await this.affected(tx, sessionIds);
    for (const b of bs)
      await this.transition(tx, b, "CANCELLED_BY_CLUB", "NONE", actorId, why);
    return bs;
  }
  async refundBookings(tx: Tx, membershipId: string) {
    return tx.booking.findMany({
      where: {
        membershipId,
        status: {
          in: [
            "CONFIRMED",
            "WAITLISTED",
            "CANCELLED_LATE",
            "ATTENDED",
            "NO_SHOW",
          ],
        },
        session: { startAt: { gt: new Date() } },
      },
      include: {
        client: { select: { name: true } },
        session: {
          select: { startAt: true, workout: { select: { name: true } } },
        },
      },
      orderBy: { session: { startAt: "asc" } },
    });
  }
  async cancelMembership(
    tx: Tx,
    membershipId: string,
    actorId: string,
    why: string,
  ) {
    const bs = await this.refundBookings(tx, membershipId);
    await this.locks(
      tx,
      bs.map((b) => b.clientId),
      bs.map((b) => b.sessionId),
    );
    for (const b of bs)
      await this.transition(tx, b, "CANCELLED_BY_CLUB", "NONE", actorId, why);
  }
  async promote(id: string) {
    return atomic(this.db, async (tx) => {
      const initial = await tx.booking.findUnique({ where: { id } });
      if (!initial || initial.status !== "WAITLISTED") return;
      await this.locks(tx, [initial.clientId], [initial.sessionId]);
      const b = await tx.booking.findUniqueOrThrow({ where: { id } }),
        s = await this.session(tx, b.sessionId);
      if (b.status !== "WAITLISTED") return;
      const policy = parse(policySchema, s.policySnapshot);
      if (
        s.status !== "PUBLISHED" ||
        s.startAt.getTime() - Date.now() <= policy.waitlistCutoffMinutes * 60000
      ) {
        await this.transition(
          tx,
          b,
          "WAITLIST_EXPIRED",
          "NONE",
          undefined,
          "Автоподтверждение завершено",
        );
        return;
      }
      const first = await tx.booking.findFirst({
        where: { sessionId: s.id, status: "WAITLISTED" },
        orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
      });
      if (first?.id !== id) return;
      if (
        (await tx.booking.count({
          where: { sessionId: s.id, status: { in: occupying } },
        })) >= s.capacity
      )
        return;
      const m = await this.rights.lock(tx, b.membershipId),
        why =
          (await this.clientReason(tx, b.clientId)) ??
          this.rights.eligibility(m, s) ??
          (this.rights.terms(m).visitLimit !== null && m.available < 1
            ? "Нет свободных посещений"
            : null) ??
          ((await this.conflict(tx, b.clientId, s))
            ? "Есть другое занятие в это время"
            : null);
      if (why) {
        await this.transition(
          tx,
          b,
          "WAITLIST_SKIPPED",
          "NONE",
          undefined,
          why,
        );
        return;
      }
      await this.transition(tx, b, "CONFIRMED", "RESERVED");
    });
  }
  async tick() {
    const rows = await this.db.$queryRaw<
      Array<{ id: string }>
    >`SELECT b.id FROM "Booking" b JOIN "ScheduledSession" s ON s.id=b."sessionId" WHERE b.status='WAITLISTED' AND (s.status<>'PUBLISHED' OR s."startAt"<=NOW()+(COALESCE((s."policySnapshot"->>'waitlistCutoffMinutes')::int,60)*INTERVAL '1 minute') OR s.capacity>(SELECT COUNT(*) FROM "Booking" x WHERE x."sessionId"=s.id AND x.status IN ('CONFIRMED','ATTENDED','NO_SHOW'))) ORDER BY b."queuedAt",b.id LIMIT 100`;
    for (const r of rows) await this.promote(r.id);
    const unmarked = await this.db.$queryRaw<
      Array<{ id: string }>
    >`SELECT b.id FROM "Booking" b JOIN "ScheduledSession" s ON s.id=b."sessionId" WHERE b.status='CONFIRMED' AND s.status<>'CANCELLED' AND s."endAt"+COALESCE((s."policySnapshot"->>'attendanceAfterHours')::int,24)*INTERVAL '1 hour'<NOW() ORDER BY s."endAt" LIMIT 100`;
    for (const r of unmarked)
      await atomic(this.db, async (tx) => {
        const initial = await tx.booking.findUniqueOrThrow({
          where: { id: r.id },
        });
        await this.locks(tx, [initial.clientId], [initial.sessionId]);
        const b = await tx.booking.findUniqueOrThrow({
          where: { id: r.id },
          include: { session: true },
        });
        if (b.status !== "CONFIRMED" || b.session.status === "CANCELLED")
          return;
        if (
          b.session.endAt.getTime() +
            parse(policySchema, b.session.policySnapshot).attendanceAfterHours *
              3600000 >=
          Date.now()
        )
          return;
        await this.transition(
          tx,
          b,
          "NO_SHOW",
          "CONSUMED",
          undefined,
          "Автоматическое закрытие неотмеченного посещения",
        );
      });
  }
}
@Module({ providers: [BookingCore], exports: [BookingCore] })
export class BookingCoreModule {}
