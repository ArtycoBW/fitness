import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto"),
  { atomic } = require("../apps/api/dist/common/transaction");
const {
    EntitlementService,
  } = require("../apps/api/dist/modules/memberships/entitlement.service"),
  {
    MembershipService,
  } = require("../apps/api/dist/modules/memberships/membership.service");
const db = new Db(),
  rights = new EntitlementService(),
  service = new MembershipService(db, rights);
const key = randomUUID(),
  base = "http://localhost:4100/api/v1";
let server: ChildProcess,
  ownerId = "",
  owner = "",
  clientId = "",
  client = "",
  planId = "",
  versionId = "",
  membershipId = "",
  orderId = "",
  freezeId = "";
const DAY = 86400000,
  today = new Date(
    new Date(Date.now() + 10800000).toISOString().slice(0, 10) +
      "T00:00:00+03:00",
  ),
  day = (n: number) =>
    new Date(today.getTime() + n * DAY + 10800000).toISOString().slice(0, 10);
const terms = {
  title: "Ритм " + key,
  description: "Восемь занятий",
  priceMinor: 450000,
  durationDays: 30,
  visitLimit: 8,
  freezeQuotaDays: 7,
  activationWindowDays: 30,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  startMinute: 0,
  endMinute: 1440,
  workoutIds: [],
  trainerIds: [],
  hallIds: [],
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = owner,
  idempotency = randomUUID(),
) {
  const res = await fetch(base + path, {
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
  return { status: res.status, data: await res.json() };
}
beforeAll(async () => {
  for (const role of ["OWNER", "CLIENT"]) {
    const raw = randomUUID();
    const user = await db.user.create({
      data: {
        name: "Абонемент " + role,
        email: role + "-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: { role } },
        ...(role === "CLIENT"
          ? {
              client: {
                create: { name: "Клиент абонемента", phone: "+79991234567" },
              },
            }
          : {}),
      },
      include: { client: true },
    });
    await db.authSession.create({
      data: {
        userId: user.id,
        tokenHash: digest(raw),
        csrfHash: digest("csrf"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    if (role === "OWNER") {
      owner = "fitness_session=" + raw;
      ownerId = user.id;
    } else {
      client = "fitness_session=" + raw;
      clientId = user.client.id;
    }
  }
  server = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, API_PORT: "4100" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health/ready")).ok) return;
    } catch {
      /* Server starting. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("API not ready");
});
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
describe.sequential("Membership terms, ledger and freeze invariants", () => {
  it("treats zero available as active for unlimited terms and rejects wrong resources", () => {
    const base = {
      startAt: today,
      endAt: new Date(today.getTime() + 30 * DAY),
      cancelledAt: null,
      available: 0,
      reserved: 0,
      consumed: 0,
      freezes: [],
      termsSnapshot: {
        ...terms,
        visitLimit: null,
        workoutIds: ["00000000-0000-4000-8000-000000000001"],
      },
    };
    expect(rights.status(base, new Date(today.getTime() + 3600000))).toBe(
      "ACTIVE",
    );
    expect(
      rights.eligibility(base, {
        startAt: today,
        endAt: new Date(today.getTime() + 3600000),
        workoutId: randomUUID(),
        trainerId: randomUUID(),
        hallId: randomUUID(),
      }),
    ).toBe("Направление не входит в абонемент");
  });
  it("creates a plan and prevents client price changes", async () => {
    const result = await call("/membership-plans", "POST", {
      slug: "rhythm-" + key,
      published: true,
      terms,
    });
    expect(result.status).toBe(201);
    planId = result.data.id;
    versionId = result.data.revision.id;
    expect(
      (
        await call(
          "/membership-plans",
          "POST",
          { slug: "bad-" + key, terms },
          client,
        )
      ).status,
    ).toBe(403);
    expect(
      (await call("/public/membership-plans")).data.some(
        (p: { id: string }) => p.id === planId,
      ),
    ).toBe(true);
  });
  it("issues rights only from a paid order, once", async () => {
    const order = await db.order.create({
      data: {
        clientId,
        planVersionId: versionId,
        totalMinor: terms.priceMinor,
        activationDate: today,
        productSnapshot: terms,
        expiresAt: new Date(Date.now() + 3600000),
        createdBy: ownerId,
      },
    });
    orderId = order.id;
    await expect(
      atomic(db, (tx: unknown) => rights.issue(tx, orderId)),
    ).rejects.toThrow();
    await db.order.update({
      where: { id: orderId },
      data: { status: "PAID", paidAt: new Date() },
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        atomic(db, (tx: unknown) => rights.issue(tx, orderId)),
      ),
    );
    membershipId = results[0].id;
    expect(new Set(results.map((m) => m.id)).size).toBe(1);
    expect(
      await db.membershipLedger.count({
        where: { membershipId, kind: "ISSUE" },
      }),
    ).toBe(1);
    expect(results[0].available).toBe(8);
  });
  it("keeps bought terms immutable when prices change", async () => {
    const result = await call("/membership-plans/" + planId, "PATCH", {
      version: 1,
      data: {
        slug: "rhythm-" + key,
        published: true,
        terms: { ...terms, priceMinor: 990000 },
      },
    });
    expect(result.status).toBe(200);
    const member = await db.membership.findUnique({
      where: { id: membershipId },
    });
    expect(member.termsSnapshot.priceMinor).toBe(450000);
    await expect(
      db.membershipPlanVersion.update({
        where: { id: versionId },
        data: { priceMinor: 1 },
      }),
    ).rejects.toThrow();
  });
  it("preserves ledger totals and consumes once on repeated events", async () => {
    await atomic(db, (tx: unknown) =>
      rights.movement(tx, membershipId, "RESERVE", "reserve:" + key, ownerId),
    );
    await atomic(db, (tx: unknown) =>
      rights.movement(tx, membershipId, "RESERVE", "reserve:" + key, ownerId),
    );
    await atomic(db, (tx: unknown) =>
      rights.movement(tx, membershipId, "CONSUME", "consume:" + key, ownerId),
    );
    await atomic(db, (tx: unknown) =>
      rights.movement(tx, membershipId, "CONSUME", "consume:" + key, ownerId),
    );
    const m = await db.membership.findUnique({ where: { id: membershipId } });
    expect([m.available, m.reserved, m.consumed]).toEqual([7, 0, 1]);
    const sum = await db.membershipLedger.aggregate({
      where: { membershipId },
      _sum: { availableDelta: true, reservedDelta: true, consumedDelta: true },
    });
    expect([
      sum._sum.availableDelta,
      sum._sum.reservedDelta,
      sum._sum.consumedDelta,
    ]).toEqual([7, 0, 1]);
    await expect(
      db.membership.update({
        where: { id: membershipId },
        data: { available: -1 },
      }),
    ).rejects.toThrow();
  });
  it("freezes once with exact quota and date extension", async () => {
    const idempotency = randomUUID();
    const body = { startDate: day(2), endDate: day(4) };
    const first = await call(
      "/memberships/" + membershipId + "/freezes",
      "POST",
      body,
      client,
      idempotency,
    );
    expect(first.status).toBe(201);
    freezeId = first.data.id;
    const second = await call(
      "/memberships/" + membershipId + "/freezes",
      "POST",
      body,
      client,
      idempotency,
    );
    expect(second.data.id).toBe(freezeId);
    expect(
      (
        await db.membership.findUnique({ where: { id: membershipId } })
      ).endAt.getTime(),
    ).toBe(today.getTime() + 32 * DAY);
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/freezes",
          "POST",
          { startDate: day(6), endDate: day(12) },
          client,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/freezes",
          "POST",
          { startDate: day(3), endDate: day(4) },
          client,
        )
      ).status,
    ).toBe(409);
  });
  it("shortens or cancels future freezes and restores original expiry", async () => {
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/freezes/" + freezeId,
          "PATCH",
          { endDate: day(3), reason: "Изменились планы" },
          client,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/freezes/" + freezeId,
          "PATCH",
          { reason: "Планы отменены" },
          client,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await db.membership.findUnique({ where: { id: membershipId } })
      ).endAt.getTime(),
    ).toBe(today.getTime() + 30 * DAY);
  });
  it("limits financial corrections by role and request identity", async () => {
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/adjustments",
          "POST",
          { delta: 1, reason: "Добавление" },
          client,
        )
      ).status,
    ).toBe(403);
    const idempotency = randomUUID();
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/adjustments",
          "POST",
          { delta: 1, reason: "Исправление ошибки" },
          owner,
          idempotency,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "/memberships/" + membershipId + "/adjustments",
          "POST",
          { delta: 2, reason: "Исправление ошибки" },
          owner,
          idempotency,
        )
      ).status,
    ).toBe(409);
  });
  it("allows only one concurrent reservation of the last credit", async () => {
    const order = await db.order.create({
      data: {
        clientId,
        planVersionId: versionId,
        totalMinor: 450000,
        status: "PAID",
        paidAt: new Date(),
        activationDate: today,
        productSnapshot: { ...terms, visitLimit: 1 },
        expiresAt: new Date(Date.now() + 3600000),
        createdBy: ownerId,
      },
    });
    const m = await atomic(db, (tx: unknown) => rights.issue(tx, order.id));
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        atomic(db, (tx: unknown) =>
          rights.movement(
            tx,
            m.id,
            "RESERVE",
            "race:" + key + ":" + i,
            ownerId,
          ),
        ),
      ),
    );
    expect(attempts.filter((r) => r.status === "fulfilled").length).toBe(1);
    const after = await db.membership.findUnique({ where: { id: m.id } });
    expect([after.available, after.reserved, after.consumed]).toEqual([
      0, 1, 0,
    ]);
  });
  it("returns one outcome for concurrent identical corrections", async () => {
    const before = await db.membership.findUnique({
        where: { id: membershipId },
      }),
      idempotency = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        call(
          "/memberships/" + membershipId + "/adjustments",
          "POST",
          { delta: 1, reason: "Повторный запрос" },
          owner,
          idempotency,
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(201));
    expect(
      (await db.membership.findUnique({ where: { id: membershipId } }))
        .available,
    ).toBe(before.available + 1);
  });
  it("checks inclusive start and exclusive expiry", async () => {
    const m = await db.membership.findUnique({
      where: { id: membershipId },
      include: { freezes: true },
    });
    expect(rights.status(m, new Date(m.endAt))).toBe("EXPIRED");
    const session = {
      startAt: today,
      endAt: new Date(today.getTime() + 3600000),
      workoutId: randomUUID(),
      trainerId: randomUUID(),
      hallId: randomUUID(),
    };
    expect(rights.eligibility(m, session)).toBeNull();
    expect(
      rights.eligibility(m, {
        ...session,
        startAt: new Date(today.getTime() - 1),
      }),
    ).toBeTruthy();
    const snap = await db.$transaction((tx: unknown) =>
      service.snapshot(tx, versionId),
    );
    expect(snap.terms.priceMinor).toBe(450000);
  });
});
