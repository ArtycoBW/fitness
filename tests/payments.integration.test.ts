import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto"),
  { atomic } = require("../apps/api/dist/common/transaction"),
  {
    MembershipService,
  } = require("../apps/api/dist/modules/memberships/membership.service"),
  {
    EntitlementService,
  } = require("../apps/api/dist/modules/memberships/entitlement.service"),
  {
    PaymentService,
  } = require("../apps/api/dist/modules/payments/payment.service"),
  {
    InternalPaymentProvider,
  } = require("../apps/api/dist/modules/payments/payment.provider");
const db = new Db(),
  rights = new EntitlementService(),
  plans = new MembershipService(db, rights),
  service = new PaymentService(
    db,
    plans,
    rights,
    new InternalPaymentProvider(),
  ),
  key = randomUUID(),
  base = "http://localhost:4100/api/v1",
  day = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
let server: ChildProcess,
  owner = "",
  client = "",
  outsider = "",
  versionId = "",
  orderId = "",
  paymentId = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = client,
  idempotency = randomUUID(),
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": "csrf",
      "Idempotency-Key": idempotency,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
async function order() {
  const r = await call("/orders", "POST", {
    planVersionId: versionId,
    activationDate: day,
  });
  expect(r.status).toBe(201);
  return r.data.id as string;
}
async function due() {
  await db.paymentAttempt.updateMany({
    where: { status: { in: ["PROCESSING", "UNKNOWN"] } },
    data: { nextCheckAt: new Date(0) },
  });
  await db.refund.updateMany({
    where: { status: { in: ["PROCESSING", "UNKNOWN"] } },
    data: { nextCheckAt: new Date(0) },
  });
  await service.tick();
}
async function paid() {
  const id = await order();
  const p = await call("/orders/" + id + "/payment-attempts", "POST", {
    method: "SBER_PAY",
  });
  expect(p.status).toBe(201);
  await due();
  return p.data.id as string;
}
beforeAll(async () => {
  for (const role of ["OWNER", "CLIENT", "OUTSIDER"]) {
    const raw = randomUUID();
    const u = await db.user.create({
      data: {
        name: "Платежи " + role,
        email: "pay-" + role + "-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: { role: role === "OUTSIDER" ? "CLIENT" : role } },
        ...(role !== "OWNER"
          ? { client: { create: { name: "Покупатель " + role } } }
          : {}),
      },
      include: { client: true },
    });
    await db.authSession.create({
      data: {
        userId: u.id,
        tokenHash: digest(raw),
        csrfHash: digest("csrf"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    if (role === "OWNER") owner = "fitness_session=" + raw;
    else if (role === "CLIENT") {
      client = "fitness_session=" + raw;
    } else outsider = "fitness_session=" + raw;
  }
  server = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, API_PORT: "4100" },
    stdio: "ignore",
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health/ready")).ok) {
        ready = true;
        break;
      }
    } catch {
      /* API starting. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("API not ready");
  const p = await call(
    "/membership-plans",
    "POST",
    {
      slug: "payment-" + key,
      published: true,
      terms: {
        title: "Абонемент оплаты",
        description: "Пакет посещений",
        priceMinor: 500000,
        durationDays: 30,
        visitLimit: 8,
        freezeQuotaDays: 7,
        activationWindowDays: 30,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startMinute: 0,
        endMinute: 1440,
        workoutIds: [],
        hallIds: [],
        trainerIds: [],
      },
    },
    owner,
  );
  expect(p.status).toBe(201);
  versionId = p.data.revision.id;
});
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
describe.sequential("Payments, settlement and refunds on PostgreSQL", () => {
  it("uses server price and prevents purchasing for another client", async () => {
    expect(
      (
        await call("/orders", "POST", {
          planVersionId: versionId,
          activationDate: day,
          totalMinor: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/orders", "POST", {
          planVersionId: versionId,
          activationDate: day,
          clientId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    orderId = await order();
    expect((await call("/orders/" + orderId)).data.totalMinor).toBe(500000);
    expect(
      (await call("/orders/" + orderId, "GET", undefined, outsider)).status,
    ).toBe(404);
  });
  it("accepts no card secrets or browser-declared success and keeps one concurrent active attempt", async () => {
    expect(
      (
        await call("/orders/" + orderId + "/payment-attempts", "POST", {
          method: "CARD",
          cardNumber: "4111111111111111",
          cvv: "123",
          status: "SUCCEEDED",
        })
      ).status,
    ).toBe(400);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        call("/orders/" + orderId + "/payment-attempts", "POST", {
          method: "CARD",
          maskedLast4: "1111",
        }),
      ),
    );
    expect(results.filter((r) => r.status !== 201)).toEqual([]);
    expect(new Set(results.map((r) => r.data.id)).size).toBe(1);
    paymentId = results[0].data.id;
    expect(results[0].data.internalOutcome).toBeUndefined();
    expect(
      (await call("/payments/" + paymentId + "/confirmation")).status,
    ).toBe(409);
    expect(await db.membership.count({ where: { orderId } })).toBe(0);
  });
  it("settles once with immutable confirmation and ledger despite replay", async () => {
    const original = await db.paymentAttempt.findUniqueOrThrow({
      where: { id: paymentId },
    });
    await due();
    await atomic(db, (tx: unknown) =>
      service.completePayment(tx, original, "SUCCEEDED"),
    );
    await due();
    expect(await db.membership.count({ where: { orderId } })).toBe(1);
    expect(
      await db.membershipLedger.count({
        where: { eventKey: "issue:" + orderId },
      }),
    ).toBe(1);
    expect(await db.paymentConfirmation.count({ where: { paymentId } })).toBe(
      1,
    );
    expect(await db.paymentEvent.count({ where: { paymentId } })).toBe(1);
    const p = await call("/payments/" + paymentId);
    expect(p.data.status).toBe("SUCCEEDED");
    expect(p.data.maskedLast4).toBe("1111");
    const c = await call("/payments/" + paymentId + "/confirmation");
    expect(c.data.reference).toMatch(/^ST[A-F0-9]{16}$/);
    expect(
      (
        await call(
          "/payments/confirmations/by-reference/" + c.data.reference,
          "GET",
          undefined,
          owner,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/payments/confirmations/by-reference/" + c.data.reference))
        .status,
    ).toBe(403);
    expect(
      (await call("/payments/" + paymentId, "GET", undefined, outsider)).status,
    ).toBe(404);
    await expect(
      db.paymentConfirmation.update({
        where: { paymentId },
        data: { reference: "ST0000000000000000" },
      }),
    ).rejects.toThrow();
  });
  it("retains failed attempt and permits a new successful attempt", async () => {
    const id = await order(),
      p = await call("/orders/" + id + "/payment-attempts", "POST", {
        method: "ALFA_PAY",
      });
    await db.paymentAttempt.update({
      where: { id: p.data.id },
      data: { internalOutcome: "FAILURE" },
    });
    await due();
    expect((await call("/payments/" + p.data.id)).data.status).toBe("FAILED");
    const retry = await call("/orders/" + id + "/payment-attempts", "POST", {
      method: "YANDEX_PAY",
    });
    expect(retry.data.id).not.toBe(p.data.id);
    await due();
    expect((await call("/payments/" + retry.data.id)).data.status).toBe(
      "SUCCEEDED",
    );
    expect(await db.paymentAttempt.count({ where: { orderId: id } })).toBe(2);
  });
  it("recovers unknown state with a fresh service instance and holds order expiry", async () => {
    const id = await order(),
      p = await call("/orders/" + id + "/payment-attempts", "POST", {
        method: "YANDEX_PAY",
      });
    await db.paymentAttempt.update({
      where: { id: p.data.id },
      data: { internalOutcome: "UNKNOWN" },
    });
    await db.order.update({ where: { id }, data: { expiresAt: new Date(0) } });
    await due();
    expect((await call("/payments/" + p.data.id)).data.status).toBe("UNKNOWN");
    expect((await call("/orders/" + id)).data.status).toBe("PENDING");
    await db.paymentAttempt.update({
      where: { id: p.data.id },
      data: { nextCheckAt: new Date(0) },
    });
    await new PaymentService(
      db,
      plans,
      rights,
      new InternalPaymentProvider(),
    ).tick();
    expect((await call("/payments/" + p.data.id)).data.status).toBe(
      "SUCCEEDED",
    );
  });
  it("restricts manual settlement and makes the receipt idempotent", async () => {
    const id = await order(),
      body = { method: "CASH", reason: "Получено на рецепции" },
      idem = randomUUID();
    expect(
      (await call("/orders/" + id + "/manual-payment", "POST", body)).status,
    ).toBe(403);
    const one = await call(
        "/orders/" + id + "/manual-payment",
        "POST",
        body,
        owner,
        idem,
      ),
      two = await call(
        "/orders/" + id + "/manual-payment",
        "POST",
        body,
        owner,
        idem,
      );
    expect(one.status).toBe(201);
    expect(one.data.status).toBe("SUCCEEDED");
    expect(one.data.id).toBe(two.data.id);
    expect(
      (
        await call(
          "/orders/" + id + "/manual-payment",
          "POST",
          { ...body, method: "TERMINAL" },
          owner,
          idem,
        )
      ).status,
    ).toBe(409);
  });
  it("requires staff and a fresh preview before refund and blocks freeze while held", async () => {
    const body = {
      amountMinor: 500000,
      reason: "Заявление клиента",
      entitlementAction: "CANCEL",
    };
    expect(
      (await call("/payments/" + paymentId + "/refund-preview", "POST", body))
        .status,
    ).toBe(403);
    const preview = await call(
      "/payments/" + paymentId + "/refund-preview",
      "POST",
      body,
      owner,
    );
    expect(preview.status).toBe(201);
    expect(
      (
        await call(
          "/payments/" + paymentId + "/refunds",
          "POST",
          { ...body, membershipVersion: preview.data.membershipVersion + 1 },
          owner,
        )
      ).status,
    ).toBe(409);
    const result = await call(
      "/payments/" + paymentId + "/refunds",
      "POST",
      { ...body, membershipVersion: preview.data.membershipVersion },
      owner,
    );
    expect(result.status).toBe(201);
    expect(
      (await db.membership.findUnique({ where: { orderId } })).refundHold,
    ).toBe(true);
    const tomorrow = new Date(Date.now() + 86400000 + 10800000)
        .toISOString()
        .slice(0, 10),
      end = new Date(Date.now() + 2 * 86400000 + 10800000)
        .toISOString()
        .slice(0, 10);
    expect(
      (
        await call(
          "/memberships/" + preview.data.membershipId + "/freezes",
          "POST",
          { startDate: tomorrow, endDate: end },
        )
      ).data.error.code,
    ).toBe("REFUND_PENDING");
    await due();
    expect(
      (await db.membership.findUnique({ where: { orderId } })).cancelledAt,
    ).not.toBeNull();
    expect((await call("/orders/" + orderId)).data.status).toBe("REFUNDED");
    expect(
      (await call("/payments/" + paymentId + "/confirmation")).status,
    ).toBe(200);
  });
  it("serializes competing refunds without exceeding original payment", async () => {
    const id = await paid(),
      body = {
        amountMinor: 300000,
        reason: "Частичный возврат",
        entitlementAction: "KEEP",
      },
      preview = await call(
        "/payments/" + id + "/refund-preview",
        "POST",
        body,
        owner,
      );
    const result = await Promise.all(
      Array.from({ length: 8 }, () =>
        call(
          "/payments/" + id + "/refunds",
          "POST",
          { ...body, membershipVersion: preview.data.membershipVersion },
          owner,
        ),
      ),
    );
    expect(result.filter((r) => r.status === 201)).toHaveLength(1);
    expect(result.filter((r) => r.status === 409)).toHaveLength(7);
    await due();
    const p = await call("/payments/" + id);
    expect(p.data.membership.cancelledAt).toBeNull();
    expect((await call("/orders/" + p.data.orderId)).data.status).toBe(
      "PARTIALLY_REFUNDED",
    );
  });
  it("releases a failed refund hold and preserves rights", async () => {
    const id = await paid(),
      body = {
        amountMinor: 500000,
        reason: "Возврат по обращению",
        entitlementAction: "CANCEL",
      },
      preview = await call(
        "/payments/" + id + "/refund-preview",
        "POST",
        body,
        owner,
      ),
      r = await call(
        "/payments/" + id + "/refunds",
        "POST",
        { ...body, membershipVersion: preview.data.membershipVersion },
        owner,
      );
    await db.refund.update({
      where: { id: r.data.id },
      data: { internalOutcome: "FAILURE" },
    });
    await due();
    const p = await call("/payments/" + id);
    expect(p.data.membership.refundHold).toBe(false);
    expect(p.data.membership.cancelledAt).toBeNull();
    expect(p.data.refunds[0].status).toBe("FAILED");
    expect(
      (await call("/payments/" + id + "/refund-preview", "POST", body, owner))
        .data.remainingMinor,
    ).toBe(500000);
  });
  it("expires unused orders and never starts a new payment for them", async () => {
    const id = await order();
    await db.order.update({ where: { id }, data: { expiresAt: new Date(0) } });
    await due();
    expect((await call("/orders/" + id)).data.status).toBe("EXPIRED");
    expect(
      (
        await call("/orders/" + id + "/payment-attempts", "POST", {
          method: "CARD",
          maskedLast4: "1111",
        })
      ).status,
    ).toBe(409);
    expect(await db.membership.count({ where: { orderId: id } })).toBe(0);
  });
});
