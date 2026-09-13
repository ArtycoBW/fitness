import { Injectable } from "@nestjs/common";
import { areaPrincipal } from "../../common/area";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Db } from "../../db";
import { parse, uuid, listQuery } from "../../common/validation";
import { atomic, audit, type Tx } from "../../common/transaction";
import { idempotent } from "../../common/idempotency";
import { fail } from "../../common/business-error";
import type { Principal } from "../auth/access";
import type { PaymentAttempt, Refund } from "../../generated/prisma/client";
import { MembershipService } from "../memberships/membership.service";
import { EntitlementService } from "../memberships/entitlement.service";
import {
  clubDay,
  midnight,
  DAY,
  termsSchema,
} from "../memberships/membership.schema";
import {
  orderSchema,
  attemptSchema,
  manualSchema,
  refundSchema,
  refundRequest,
} from "./payment.schema";
import { InternalPaymentProvider } from "./payment.provider";
import { BookingCore } from "../bookings/booking-core.service";
import { notifyUser } from "../notifications/notification.service";
const pending = ["PROCESSING", "UNKNOWN"];
const paymentInclude = {
  order: {
    select: {
      id: true,
      clientId: true,
      productSnapshot: true,
      client: { select: { name: true } },
      membership: {
        select: {
          id: true,
          version: true,
          refundHold: true,
          cancelledAt: true,
          available: true,
          reserved: true,
          consumed: true,
        },
      },
    },
  },
  refunds: true,
  confirmation: true,
} as const;
const staff = (a: Principal) =>
  a.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r));
@Injectable()
export class PaymentService {
  constructor(
    private readonly db: Db,
    private readonly plans: MembershipService,
    private readonly rights: EntitlementService,
    private readonly provider: InternalPaymentProvider,
    private readonly bookings: BookingCore = new BookingCore(db),
  ) {}
  scope(auth: Principal, clientId: string) {
    if (!staff(auth) && auth.clientId !== clientId)
      fail("NOT_FOUND", "Операция не найдена", 404);
  }
  view(p: PaymentAttempt) {
    return {
      id: p.id,
      orderId: p.orderId,
      method: p.method,
      status: p.status,
      amountMinor: p.amountMinor,
      maskedLast4: p.maskedLast4,
      confirmedAt: p.confirmedAt,
      createdAt: p.createdAt,
      failureCode: p.failureCode,
    };
  }
  refundView(r: Refund) {
    return {
      id: r.id,
      paymentId: r.paymentId,
      amountMinor: r.amountMinor,
      status: r.status,
      reason: r.reason,
      entitlementAction: r.entitlementAction,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    };
  }
  async createOrder(auth: Principal, body: unknown, key?: string) {
    const dto = parse(orderSchema, body);
    const clientId = staff(auth)
      ? (dto.clientId ?? auth.clientId)
      : auth.clientId;
    if (!clientId) fail("CLIENT_REQUIRED", "Выберите клиента", 400);
    if (!staff(auth) && dto.clientId && dto.clientId !== auth.clientId)
      fail("NOT_FOUND", "Клиент не найден", 404);
    return idempotent(
      this.db,
      auth.id,
      "order-create",
      key,
      dto,
      async (tx) => {
        const client = await tx.clientProfile.findUnique({
          where: { id: clientId },
        });
        if (
          !client ||
          client.archivedAt ||
          client.status !== "ACTIVE" ||
          client.visitsBlocked
        )
          fail(
            "CLIENT_UNAVAILABLE",
            "Покупка для этого клиента недоступна",
            409,
          );
        if (clientId === auth.clientId && !client.phone)
          fail("PROFILE_INCOMPLETE", "Добавьте телефон в профиле", 403);
        const { terms, plan } = await this.plans.snapshot(
          tx,
          dto.planVersionId,
        );
        const latest = await tx.membershipPlanVersion.findFirst({
          where: { planId: plan.id },
          orderBy: { number: "desc" },
        });
        if (
          plan.archivedAt ||
          (!staff(auth) && !plan.published) ||
          latest?.id !== dto.planVersionId
        )
          fail("PLAN_CHANGED", "Тариф изменился. Обновите страницу", 409);
        const activationDate = midnight(dto.activationDate),
          today = midnight(clubDay());
        if (
          activationDate < today ||
          activationDate.getTime() >
            today.getTime() + terms.activationWindowDays * DAY
        )
          fail(
            "ACTIVATION_DATE",
            "Выберите дату в пределах срока активации тарифа",
            422,
          );
        const order = await tx.order.create({
          data: {
            clientId,
            planVersionId: dto.planVersionId,
            totalMinor: terms.priceMinor,
            activationDate,
            productSnapshot: terms,
            expiresAt: new Date(Date.now() + 30 * 60000),
            createdBy: auth.id,
          },
        });
        await audit(tx, auth.id, "ORDER_CREATED", "Order", order.id, {
          amountMinor: order.totalMinor,
        });
        return order;
      },
    );
  }
  async order(auth: Principal, id: string) {
    parse(uuid, id);
    const o = await this.db.order.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { createdAt: "desc" } },
        membership: { select: { id: true } },
        client: { select: { name: true } },
      },
    });
    if (!o) fail("NOT_FOUND", "Заказ не найден", 404);
    this.scope(auth, o.clientId);
    return { ...o, payments: o.payments.map((p) => this.view(p)) };
  }
  async lockOrder(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) fail("NOT_FOUND", "Заказ не найден", 404);
    return order;
  }
  async attempt(
    auth: Principal,
    id: string,
    body: unknown,
    key?: string,
    manual = false,
  ) {
    parse(uuid, id);
    const dto = manual ? parse(manualSchema, body) : parse(attemptSchema, body);
    return idempotent(
      this.db,
      auth.id,
      (manual ? "manual-pay:" : "pay:") + id,
      key,
      dto,
      async (tx) => {
        const order = await this.lockOrder(tx, id);
        this.scope(auth, order.clientId);
        const active = await tx.paymentAttempt.findFirst({
          where: { orderId: id, status: { in: pending } },
        });
        if (active) return this.view(active);
        if (order.status !== "PENDING" || order.expiresAt <= new Date())
          fail(
            "ORDER_CLOSED",
            "Срок оплаты заказа истёк или заказ уже оплачен",
            409,
          );
        const p = await tx.paymentAttempt.create({
          data: {
            orderId: id,
            method: dto.method,
            provider: manual ? "manual" : "simulator",
            amountMinor: order.totalMinor,
            maskedLast4: "maskedLast4" in dto ? dto.maskedLast4 : undefined,
            nextCheckAt: new Date(Date.now() + 2000),
          },
        });
        await audit(
          tx,
          auth.id,
          manual ? "MANUAL_PAYMENT_RECORDED" : "PAYMENT_STARTED",
          "Payment",
          p.id,
          { orderId: id, method: dto.method },
          "reason" in dto ? dto.reason : undefined,
        );
        if (manual) {
          await this.completePayment(tx, p, "SUCCEEDED");
          return this.view(
            await tx.paymentAttempt.findUniqueOrThrow({ where: { id: p.id } }),
          );
        }
        return this.view(p);
      },
    );
  }
  async completePayment(
    tx: Tx,
    p: PaymentAttempt,
    result: "SUCCEEDED" | "FAILED" | "UNKNOWN",
  ) {
    p = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: p.id } });
    if (!pending.includes(p.status)) return;
    const order = await this.lockOrder(tx, p.orderId);
    if (result === "UNKNOWN") {
      await tx.paymentAttempt.update({
        where: { id: p.id },
        data: {
          status: result,
          checkCount: { increment: 1 },
          nextCheckAt: new Date(Date.now() + 4000),
        },
      });
      return;
    }
    const eventId = p.providerPaymentId + ":" + result;
    const previous = await tx.paymentEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: p.provider,
          providerEventId: eventId,
        },
      },
    });
    if (previous) return;
    if (p.amountMinor !== order.totalMinor)
      fail("PAYMENT_AMOUNT", "Сумма платежа не соответствует заказу");
    await tx.paymentEvent.create({
      data: {
        provider: p.provider,
        providerEventId: eventId,
        paymentId: p.id,
        eventType: result,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: p.id },
      data: {
        status: result,
        confirmedAt: result === "SUCCEEDED" ? new Date() : null,
        failureCode: result === "FAILED" ? "DECLINED" : null,
        checkCount: { increment: 1 },
      },
    });
    if (result === "FAILED") return;
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    const m = await this.rights.issue(tx, order.id),
      client = await tx.clientProfile.findUniqueOrThrow({
        where: { id: order.clientId },
      }),
      terms = parse(termsSchema, order.productSnapshot);
    await tx.paymentConfirmation.create({
      data: {
        paymentId: p.id,
        reference: "ST" + randomBytes(8).toString("hex").toUpperCase(),
        immutableSnapshot: {
          paymentId: p.id,
          orderId: order.id,
          membershipId: m.id,
          title: terms.title,
          clientName: client.name,
          amountMinor: p.amountMinor,
          currency: "RUB",
          method: p.method,
          maskedLast4: p.maskedLast4,
          date: new Date().toISOString(),
        },
      },
    });
    await audit(tx, order.createdBy, "PAYMENT_SUCCEEDED", "Payment", p.id, {
      amountMinor: p.amountMinor,
    });
    if (client.userId)
      await notifyUser(tx, client.userId, {
        type: "PAYMENT",
        title: "Оплата прошла",
        text:
          terms.title +
          " · " +
          new Intl.NumberFormat("ru-RU", {
            style: "currency",
            currency: "RUB",
          }).format(p.amountMinor / 100),
        href: "/payments/" + p.id + "/confirmation",
        eventKey: "payment:" + p.id + ":success",
      });
    if (m.endAt <= new Date()) {
      await tx.membership.update({
        where: { id: m.id },
        data: { refundHold: true, version: { increment: 1 } },
      });
      await tx.refund.create({
        data: {
          paymentId: p.id,
          amountMinor: p.amountMinor,
          reason: "Позднее подтверждение после окончания срока абонемента",
          entitlementAction: "CANCEL",
          requestedBy: order.createdBy,
        },
      });
    }
  }
  async list(auth: Principal, query: unknown) {
    auth = areaPrincipal(auth, parse(listQuery, query).area);
    const q = parse(
      listQuery.extend({
        clientId: uuid.optional(),
        status: z
          .enum(["PROCESSING", "UNKNOWN", "SUCCEEDED", "FAILED"])
          .optional(),
      }),
      query,
    );
    const clientId = staff(auth)
      ? q.clientId
      : (auth.clientId ?? "00000000-0000-0000-0000-000000000000");
    const where = {
      status: q.status,
      order: {
        clientId,
        client: { name: { contains: q.q, mode: "insensitive" as const } },
      },
    };
    const [rows, total] = await this.db.$transaction([
      this.db.paymentAttempt.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.paymentAttempt.count({ where }),
    ]);
    return {
      items: rows.map((p) => ({
        ...this.view(p),
        client: p.order.client,
        title: parse(termsSchema, p.order.productSnapshot).title,
        refundedMinor: p.refunds
          .filter((r) => r.status === "SUCCEEDED")
          .reduce((s, r) => s + r.amountMinor, 0),
      })),
      total,
    };
  }
  async detail(auth: Principal, id: string) {
    parse(uuid, id);
    const p = await this.db.paymentAttempt.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!p) fail("NOT_FOUND", "Платёж не найден", 404);
    this.scope(auth, p.order.clientId);
    return {
      ...this.view(p),
      client: p.order.client,
      title: parse(termsSchema, p.order.productSnapshot).title,
      membership: p.order.membership,
      refunds: p.refunds.map((r) => this.refundView(r)),
      confirmation: p.confirmation,
    };
  }
  async confirmation(auth: Principal, id: string) {
    const p = await this.detail(auth, id);
    if (!p.confirmation)
      fail(
        "PAYMENT_PENDING",
        "Подтверждение появится после успешной оплаты",
        409,
      );
    return p.confirmation;
  }
  async byReference(auth: Principal, reference: string) {
    parse(z.string().regex(/^ST[A-F0-9]{16}$/), reference);
    const c = await this.db.paymentConfirmation.findUnique({
      where: { reference },
    });
    if (!c) fail("NOT_FOUND", "Подтверждение не найдено", 404);
    return this.detail(auth, c.paymentId);
  }
  async refundCalculation(
    tx: Tx,
    id: string,
    body: z.infer<typeof refundSchema>,
  ) {
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id=${id}::uuid FOR UPDATE`;
    const p = await tx.paymentAttempt.findUnique({
      where: { id },
      include: { refunds: true, order: { include: { membership: true } } },
    });
    if (!p || p.status !== "SUCCEEDED")
      fail("NOT_FOUND", "Успешный платёж не найден", 404);
    const m = p.order.membership;
    if (!m) fail("MEMBERSHIP_MISSING", "Абонемент ещё оформляется");
    const held = p.refunds
        .filter((r) => r.status !== "FAILED")
        .reduce((s, r) => s + r.amountMinor, 0),
      remaining = p.amountMinor - held;
    if (body.amountMinor > remaining)
      fail("REFUND_LIMIT", "Сумма превышает доступный остаток", 409);
    const action =
      body.amountMinor === remaining ? "CANCEL" : body.entitlementAction;
    return {
      p,
      m,
      remaining,
      action,
      consumed: m.consumed,
      reserved: m.reserved,
    };
  }
  async previewRefund(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(refundSchema, body);
    return atomic(this.db, async (tx) => {
      const c = await this.refundCalculation(tx, id, dto);
      return {
        amountMinor: dto.amountMinor,
        remainingMinor: c.remaining,
        entitlementAction: c.action,
        membershipVersion: c.m.version,
        membershipId: c.m.id,
        consumed: c.consumed,
        reserved: c.reserved,
        bookings:
          c.action === "CANCEL"
            ? await this.bookings.refundBookings(tx, c.m.id)
            : [],
        message:
          c.action === "CANCEL"
            ? "Абонемент будет прекращён после подтверждения возврата"
            : "Абонемент и оставшиеся посещения сохранятся",
      };
    });
  }
  async createRefund(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(refundRequest, body);
    return idempotent(
      this.db,
      auth.id,
      "refund:" + id,
      key,
      dto,
      async (tx) => {
        const c = await this.refundCalculation(tx, id, dto);
        await this.bookings.locks(tx, [c.m.clientId], []);
        const m = await this.rights.lock(tx, c.m.id);
        if (m.version !== dto.membershipVersion)
          fail(
            "VERSION_CONFLICT",
            "Права по абонементу изменились. Повторите предпросмотр",
          );
        const r = await tx.refund.create({
          data: {
            paymentId: id,
            amountMinor: dto.amountMinor,
            reason: dto.reason,
            entitlementAction: c.action,
            requestedBy: auth.id,
            nextCheckAt: new Date(Date.now() + 2000),
          },
        });
        if (c.action === "CANCEL")
          await tx.membership.update({
            where: { id: m.id },
            data: { refundHold: true, version: { increment: 1 } },
          });
        await audit(
          tx,
          auth.id,
          "REFUND_REQUESTED",
          "Refund",
          r.id,
          {
            amountMinor: r.amountMinor,
            entitlementAction: r.entitlementAction,
          },
          dto.reason,
        );
        return this.refundView(r);
      },
    );
  }
  async completeRefund(
    tx: Tx,
    r: Refund,
    result: "SUCCEEDED" | "FAILED" | "UNKNOWN",
  ) {
    r = await tx.refund.findUniqueOrThrow({ where: { id: r.id } });
    if (!pending.includes(r.status)) return;
    const p = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: r.paymentId },
    });
    await this.lockOrder(tx, p.orderId);
    if (result === "UNKNOWN") {
      await tx.refund.update({
        where: { id: r.id },
        data: {
          status: result,
          checkCount: { increment: 1 },
          nextCheckAt: new Date(Date.now() + 4000),
        },
      });
      return;
    }
    await tx.refund.update({
      where: { id: r.id },
      data: {
        status: result,
        completedAt: new Date(),
        checkCount: { increment: 1 },
      },
    });
    const m = await tx.membership.findUniqueOrThrow({
      where: { orderId: p.orderId },
    });
    await this.bookings.locks(tx, [m.clientId], []);
    if (result === "SUCCEEDED" && r.entitlementAction === "CANCEL")
      await this.bookings.cancelMembership(tx, m.id, r.requestedBy, r.reason);
    await this.rights.lock(tx, m.id);
    const otherHold = await tx.refund.count({
      where: {
        paymentId: p.id,
        entitlementAction: "CANCEL",
        status: { in: pending },
      },
    });
    await tx.membership.update({
      where: { id: m.id },
      data: {
        refundHold: otherHold > 0,
        ...(result === "SUCCEEDED" && r.entitlementAction === "CANCEL"
          ? { cancelledAt: new Date() }
          : {}),
        version: { increment: 1 },
      },
    });
    if (result === "SUCCEEDED") {
      const client = await tx.clientProfile.findUnique({
        where: { id: m.clientId },
      });
      if (client?.userId)
        await notifyUser(tx, client.userId, {
          type: "PAYMENT",
          title: "Возврат оформлен",
          text: new Intl.NumberFormat("ru-RU", {
            style: "currency",
            currency: "RUB",
          }).format(r.amountMinor / 100),
          href: "/account/payments/" + p.id,
          eventKey: "refund:" + r.id + ":success",
        });
      const total = await tx.refund.aggregate({
        where: { paymentId: p.id, status: "SUCCEEDED" },
        _sum: { amountMinor: true },
      });
      await tx.order.update({
        where: { id: p.orderId },
        data: {
          status:
            total._sum.amountMinor === p.amountMinor
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED",
        },
      });
    }
    await audit(
      tx,
      r.requestedBy,
      "REFUND_" + result,
      "Refund",
      r.id,
      { amountMinor: r.amountMinor },
      r.reason,
    );
  }
  async refunds(auth: Principal, query: unknown) {
    const q = parse(listQuery, query);
    const where = staff(auth)
      ? {}
      : {
          payment: {
            order: {
              clientId: auth.clientId ?? "00000000-0000-0000-0000-000000000000",
            },
          },
        };
    const [rows, total] = await this.db.$transaction([
      this.db.refund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.refund.count({ where }),
    ]);
    return { items: rows.map((r) => this.refundView(r)), total };
  }
  async refund(auth: Principal, id: string) {
    parse(uuid, id);
    const r = await this.db.refund.findUnique({
      where: { id },
      include: {
        payment: { select: { order: { select: { clientId: true } } } },
      },
    });
    if (!r) fail("NOT_FOUND", "Возврат не найден", 404);
    this.scope(auth, r.payment.order.clientId);
    return this.refundView(r);
  }
  async tick() {
    for (let n = 0; n < 30; n++) {
      const worked = await atomic(this.db, async (tx) => {
        const ids = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "PaymentAttempt" WHERE status IN ('PROCESSING','UNKNOWN') AND "nextCheckAt"<=NOW() ORDER BY "nextCheckAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!ids[0]) return false;
        const p = await tx.paymentAttempt.findUniqueOrThrow({
          where: { id: ids[0].id },
        });
        await this.completePayment(
          tx,
          p,
          this.provider.resolve(p.internalOutcome, p.checkCount),
        );
        return true;
      });
      if (!worked) break;
    }
    for (let n = 0; n < 30; n++) {
      const worked = await atomic(this.db, async (tx) => {
        const ids = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Refund" WHERE status IN ('PROCESSING','UNKNOWN') AND "nextCheckAt"<=NOW() ORDER BY "nextCheckAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!ids[0]) return false;
        const r = await tx.refund.findUniqueOrThrow({
          where: { id: ids[0].id },
        });
        await this.completeRefund(
          tx,
          r,
          this.provider.resolve(r.internalOutcome, r.checkCount),
        );
        return true;
      });
      if (!worked) break;
    }
    await this.db.order.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: new Date() },
        payments: { none: { status: { in: pending } } },
      },
      data: { status: "EXPIRED" },
    });
  }
}
