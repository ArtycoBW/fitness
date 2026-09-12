import { Injectable } from "@nestjs/common";
import { parse } from "../../common/validation";
import { fail } from "../../common/business-error";
import { type Tx, audit } from "../../common/transaction";
import { type Terms, termsSchema, DAY } from "./membership.schema";
import type {
  Membership,
  MembershipFreeze,
} from "../../generated/prisma/client";
export type Entitlement = Membership & { freezes: MembershipFreeze[] };
export type LedgerKind =
  "ISSUE" | "RESERVE" | "RELEASE" | "CONSUME" | "RESTORE" | "ADJUST";
const deltas = {
  RESERVE: [-1, 1, 0],
  RELEASE: [1, -1, 0],
  CONSUME: [0, -1, 1],
  RESTORE: [1, 0, -1],
} as const;
@Injectable()
export class EntitlementService {
  async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${id}::uuid FOR UPDATE`;
    const membership = await tx.membership.findUnique({
      where: { id },
      include: { freezes: true },
    });
    if (!membership) fail("NOT_FOUND", "Абонемент не найден", 404);
    return membership;
  }
  terms(membership: Membership): Terms {
    return parse(termsSchema, membership.termsSnapshot);
  }
  status(m: Entitlement, now = new Date()) {
    if (m.cancelledAt) return "CANCELLED";
    if (m.startAt > now) return "SCHEDULED";
    if (m.endAt <= now) return "EXPIRED";
    if (
      m.freezes.some(
        (f) => f.status === "ACTIVE" && f.startAt <= now && f.endAt > now,
      )
    )
      return "FROZEN";
    if (this.terms(m).visitLimit !== null && m.available === 0)
      return "EXHAUSTED";
    return "ACTIVE";
  }
  eligibility(
    m: Entitlement,
    session: {
      startAt: Date;
      endAt: Date;
      workoutId: string;
      trainerId: string;
      hallId: string;
    },
  ) {
    const terms = this.terms(m);
    if (m.cancelledAt) return "Абонемент отменён";
    if (session.startAt < m.startAt || session.endAt > m.endAt)
      return "Занятие вне срока действия";
    if (
      m.freezes.some(
        (f) =>
          f.status === "ACTIVE" &&
          f.startAt < session.endAt &&
          f.endAt > session.startAt,
      )
    )
      return "На дату занятия действует заморозка";
    if (
      terms.workoutIds.length &&
      !terms.workoutIds.includes(session.workoutId)
    )
      return "Направление не входит в абонемент";
    if (
      terms.trainerIds.length &&
      !terms.trainerIds.includes(session.trainerId)
    )
      return "Тренер не входит в абонемент";
    if (terms.hallIds.length && !terms.hallIds.includes(session.hallId))
      return "Зал не входит в абонемент";
    const local = new Date(session.startAt.getTime() + 10800000),
      end = new Date(session.endAt.getTime() + 10800000);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes(),
      endMinute = end.getUTCHours() * 60 + end.getUTCMinutes();
    if (
      !terms.weekdays.includes(local.getUTCDay()) ||
      minute < terms.startMinute ||
      (end.getUTCDate() !== local.getUTCDate() && endMinute !== 0) ||
      (endMinute || 1440) > terms.endMinute
    )
      return "Занятие вне разрешённого времени";
    return null;
  }
  async movement(
    tx: Tx,
    id: string,
    kind: LedgerKind,
    eventKey: string,
    actorId?: string,
    bookingId?: string,
    amount?: number,
    reason?: string,
  ) {
    const m = await this.lock(tx, id);
    const old = await tx.membershipLedger.findUnique({ where: { eventKey } });
    if (old) {
      if (old.membershipId !== id || old.kind !== kind)
        fail("EVENT_CONFLICT", "Операция уже использована");
      return m;
    }
    const unlimited = this.terms(m).visitLimit === null;
    const change =
      kind === "ISSUE" || kind === "ADJUST"
        ? [amount ?? 0, 0, 0]
        : [...deltas[kind]];
    if (unlimited) change[0] = 0;
    const [availableDelta = 0, reservedDelta = 0, consumedDelta = 0] = change;
    if (
      m.available + availableDelta < 0 ||
      m.reserved + reservedDelta < 0 ||
      m.consumed + consumedDelta < 0
    )
      fail("INSUFFICIENT_CREDITS", "Недостаточно доступных посещений", 409);
    await tx.membershipLedger.create({
      data: {
        membershipId: id,
        eventKey,
        kind,
        availableDelta,
        reservedDelta,
        consumedDelta,
        actorId,
        bookingId,
        reason,
      },
    });
    return tx.membership.update({
      where: { id },
      data: {
        available: { increment: availableDelta },
        reserved: { increment: reservedDelta },
        consumed: { increment: consumedDelta },
        version: { increment: 1 },
      },
    });
  }
  async issue(tx: Tx, orderId: string) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PAID" || !order.paidAt)
      fail(
        "PAYMENT_REQUIRED",
        "Для выдачи абонемента необходима подтверждённая оплата",
      );
    const existing = await tx.membership.findUnique({ where: { orderId } });
    if (existing) return existing;
    const terms = parse(termsSchema, order.productSnapshot);
    const member = await tx.membership.create({
      data: {
        clientId: order.clientId,
        planVersionId: order.planVersionId,
        orderId,
        startAt: order.activationDate,
        endAt: new Date(
          order.activationDate.getTime() + terms.durationDays * DAY,
        ),
        termsSnapshot: terms,
      },
    });
    await this.movement(
      tx,
      member.id,
      "ISSUE",
      "issue:" + orderId,
      order.createdBy,
      undefined,
      terms.visitLimit ?? 0,
    );
    await audit(
      tx,
      order.createdBy,
      "MEMBERSHIP_ISSUED",
      "Membership",
      member.id,
      { orderId },
    );
    return tx.membership.findUniqueOrThrow({ where: { id: member.id } });
  }
}
