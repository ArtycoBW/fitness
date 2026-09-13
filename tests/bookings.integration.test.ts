import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto"),
  { atomic } = require("../apps/api/dist/common/transaction"),
  {
    BookingCore,
  } = require("../apps/api/dist/modules/bookings/booking-core.service"),
  {
    EntitlementService,
  } = require("../apps/api/dist/modules/memberships/entitlement.service"),
  {
    MembershipService,
  } = require("../apps/api/dist/modules/memberships/membership.service"),
  {
    ScheduleService,
  } = require("../apps/api/dist/modules/schedule/schedule.service"),
  {
    ResourceService,
  } = require("../apps/api/dist/modules/schedule/resource.service"),
  {
    PaymentService,
  } = require("../apps/api/dist/modules/payments/payment.service"),
  {
    InternalPaymentProvider,
  } = require("../apps/api/dist/modules/payments/payment.provider");
const db = new Db(),
  rights = new EntitlementService(),
  plans = new MembershipService(db, rights),
  core = new BookingCore(db),
  schedule = new ScheduleService(db, new ResourceService(), core),
  payments = new PaymentService(
    db,
    plans,
    rights,
    new InternalPaymentProvider(),
    core,
  ),
  base = "http://localhost:4100/api/v1",
  key = randomUUID();
let server: ChildProcess,
  owner = "",
  ownerId = "",
  trainerCookie = "",
  workoutId = "",
  planVersionId = "";
const trainers: string[] = [],
  halls: string[] = [],
  clients: Array<{ id: string; cookie: string; membershipId: string }> = [];
const DAY = 86400000,
  day = (n: number) =>
    new Date(Date.now() + n * DAY + 10800000).toISOString().slice(0, 10),
  at = (n: number, hour = 12) =>
    new Date(day(n) + "T" + String(hour).padStart(2, "0") + ":00:00+03:00");
const terms = {
  title: "Абонемент записи",
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
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = owner,
  idem = randomUUID(),
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": "csrf",
      "Idempotency-Key": idem,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
async function member(clientId: string, count = 8) {
  return atomic(db, async (tx: typeof db) => {
    const o = await tx.order.create({
      data: {
        clientId,
        planVersionId,
        totalMinor: terms.priceMinor,
        status: "PAID",
        paidAt: new Date(),
        activationDate: new Date(day(0) + "T00:00:00+03:00"),
        productSnapshot: { ...terms, visitLimit: count },
        expiresAt: new Date(Date.now() + 1800000),
        createdBy: ownerId,
      },
    });
    return rights.issue(tx, o.id);
  });
}
async function session(
  n: number,
  hour = 12,
  capacity = 1,
  resource = 0,
  start?: Date,
) {
  const startAt = start ?? at(n, hour);
  return atomic(db, (tx: typeof db) =>
    schedule.createOne(
      tx,
      { id: ownerId },
      {
        workoutId,
        trainerId: trainers[resource],
        hallId: halls[resource],
        capacity,
        status: "PUBLISHED",
        startAt: startAt.toISOString(),
        endAt: new Date(startAt.getTime() + 3600000).toISOString(),
      },
    ),
  );
}
async function book(
  c: number,
  s: string,
  waitlist = false,
  membershipId = clients[c]!.membershipId,
  idem = randomUUID(),
) {
  return call(
    "/bookings",
    "POST",
    { sessionId: s, membershipId, waitlist },
    clients[c]!.cookie,
    idem,
  );
}
beforeAll(async () => {
  const raw = randomUUID(),
    o = await db.user.create({
      data: {
        name: "Руководитель записей",
        email: "book-owner-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: { role: "OWNER" } },
      },
    });
  ownerId = o.id;
  owner = "fitness_session=" + raw;
  await db.authSession.create({
    data: {
      userId: o.id,
      tokenHash: digest(raw),
      csrfHash: digest("csrf"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const plan = await db.membershipPlan.create({
    data: { name: "Записи", slug: "book-" + key, published: true },
  });
  const { workoutIds: _w, hallIds: _h, trainerIds: _t, ...attributes } = terms;
  const revision = await db.membershipPlanVersion.create({
    data: { ...attributes, number: 1, planId: plan.id },
  });
  planVersionId = revision.id;
  for (let i = 0; i < 2; i++) {
    const raw = randomUUID(),
      u = await db.user.create({
        data: {
          name: "Тренер записи " + i,
          email: "book-trainer-" + i + "-" + key + "@example.com",
          passwordHash: "unused",
          roles: { create: { role: "TRAINER" } },
          trainer: {
            create: {
              slug: "book-" + i + "-" + key,
              active: true,
              specialties: ["Пилатес"],
              workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
                day,
                start: 0,
                end: 1440,
              })),
            },
          },
        },
        include: { trainer: true },
      });
    trainers.push(u.trainer.id);
    if (i === 0) {
      trainerCookie = "fitness_session=" + raw;
      await db.authSession.create({
        data: {
          userId: u.id,
          tokenHash: digest(raw),
          csrfHash: digest("csrf"),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    }
    halls.push(
      (
        await db.hall.create({
          data: {
            name: "Зал записи " + i,
            slug: "book-" + i + "-" + key,
            capacity: 30,
          },
        })
      ).id,
    );
  }
  workoutId = (
    await db.workoutType.create({
      data: {
        name: "Пилатес",
        slug: "book-" + key,
        category: "Пилатес",
        capacity: 30,
      },
    })
  ).id;
  for (let i = 0; i < 24; i++) {
    const raw = randomUUID(),
      u = await db.user.create({
        data: {
          name: "Участник " + i,
          email: "book-client-" + i + "-" + key + "@example.com",
          passwordHash: "unused",
          emailVerifiedAt: new Date(),
          roles: { create: { role: "CLIENT" } },
          client: { create: { name: "Участник " + i, phone: "+79991234567" } },
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
    clients.push({
      id: u.client.id,
      cookie: "fitness_session=" + raw,
      membershipId: (await member(u.client.id)).id,
    });
  }
  server = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, API_PORT: "4100" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health/ready")).ok) return;
    } catch {
      /* API starting. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("API not ready");
}, 30000);
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
describe.sequential("Bookings and concurrency with PostgreSQL", () => {
  it("admits exactly one of twenty contenders for the last place", async () => {
    const s = await session(3);
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) => book(i, s.id)),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(19);
    expect(
      await db.booking.count({
        where: { sessionId: s.id, status: "CONFIRMED" },
      }),
    ).toBe(1);
    expect((await call("/public/schedule/" + s.id)).data.freePlaces).toBe(0);
  });
  it("does not spend the same final credit on two different sessions", async () => {
    const c = 20,
      m = await member(clients[c]!.id, 1),
      a = await session(4, 10),
      b = await session(4, 12);
    const rs = await Promise.all([
      book(c, a.id, false, m.id),
      book(c, b.id, false, m.id),
    ]);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(1);
    const after = await db.membership.findUnique({ where: { id: m.id } });
    expect([after.available, after.reserved, after.consumed]).toEqual([
      0, 1, 0,
    ]);
  });
  it("replays eight identical requests without duplicate booking or reserve", async () => {
    const s = await session(5),
      idem = randomUUID();
    const rs = await Promise.all(
      Array.from({ length: 8 }, () =>
        book(21, s.id, false, clients[21]!.membershipId, idem),
      ),
    );
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.data.id)).size).toBe(1);
    expect(
      await db.membershipLedger.count({
        where: { bookingId: rs[0].data.id, kind: "RESERVE" },
      }),
    ).toBe(1);
    expect((await book(21, s.id)).data.id).toBe(rs[0].data.id);
  });
  it("blocks overlapping client bookings across two halls", async () => {
    const a = await session(6, 12, 1, 0),
      b = await session(6, 12, 1, 1);
    const rs = await Promise.all([book(22, a.id), book(22, b.id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it("keeps FIFO priority, skips ineligible candidate and reserves exactly once", async () => {
    const s = await session(7),
      first = await book(0, s.id);
    expect(first.status).toBe(201);
    const one = await book(1, s.id, true),
      two = await book(2, s.id, true);
    expect(one.data.status).toBe("WAITLISTED");
    expect(two.data.status).toBe("WAITLISTED");
    const m = await db.membership.findUnique({
      where: { id: clients[1]!.membershipId },
    });
    await atomic(db, (tx: typeof db) =>
      rights.movement(
        tx,
        m.id,
        "ADJUST",
        "empty:" + key,
        ownerId,
        undefined,
        -m.available,
        "Все посещения использованы",
      ),
    );
    expect(
      (
        await call(
          "/bookings/" + first.data.id + "/cancel",
          "POST",
          { version: first.data.version },
          clients[0]!.cookie,
        )
      ).status,
    ).toBe(201);
    expect((await book(3, s.id)).data.error.code).toBe("WAITLIST_PRIORITY");
    await core.tick();
    await core.tick();
    expect(
      (await db.booking.findUnique({ where: { id: one.data.id } })).status,
    ).toBe("WAITLIST_SKIPPED");
    expect(
      (await db.booking.findUnique({ where: { id: two.data.id } })).status,
    ).toBe("CONFIRMED");
    expect(
      await db.membershipLedger.count({
        where: { bookingId: two.data.id, kind: "RESERVE" },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { eventKey: { startsWith: "booking:" + two.data.id } },
      }),
    ).toBe(2);
  });
  it("requires explicit late cancellation and restores its prior debit on reinstatement and club cancellation", async () => {
    const s = await session(0, 0, 1, 1, new Date(Date.now() + 90 * 60000)),
      r = await book(4, s.id);
    expect(r.status).toBe(201);
    const preview = await call(
      "/bookings/" + r.data.id + "/cancel-preview",
      "POST",
      {},
      clients[4]!.cookie,
    );
    expect(preview.data.late).toBe(true);
    expect(
      (
        await call(
          "/bookings/" + r.data.id + "/cancel",
          "POST",
          { version: r.data.version },
          clients[4]!.cookie,
        )
      ).data.error.code,
    ).toBe("LATE_CONFIRMATION");
    const cancel = await call(
      "/bookings/" + r.data.id + "/cancel",
      "POST",
      { version: r.data.version, acceptLoss: true },
      clients[4]!.cookie,
    );
    expect(cancel.data.balanceState).toBe("CONSUMED");
    const restored = await book(4, s.id);
    expect(restored.data.id).toBe(r.data.id);
    expect(restored.data.balanceState).toBe("RESERVED");
    await call(
      "/bookings/" + r.data.id + "/cancel",
      "POST",
      { version: restored.data.version, acceptLoss: true },
      clients[4]!.cookie,
    );
    const club = await call("/schedule/" + s.id + "/cancel", "POST", {
      version: s.version,
      scope: "ONE",
      reason: "Закрытие занятия",
    });
    expect(club.status).toBe(201);
    expect(
      (await db.booking.findUnique({ where: { id: r.data.id } })).balanceState,
    ).toBe("NONE");
    const ledger = await db.membershipLedger.aggregate({
      where: { bookingId: r.data.id },
      _sum: { availableDelta: true, reservedDelta: true, consumedDelta: true },
    });
    expect(ledger._sum).toEqual({
      availableDelta: 0,
      reservedDelta: 0,
      consumedDelta: 0,
    });
  });
  it("checks own trainer permissions, attendance window and compensating corrections", async () => {
    const s = await session(8),
      r = await book(5, s.id);
    expect(
      (
        await call(
          "/bookings/" + r.data.id + "/attendance",
          "POST",
          { version: r.data.version, status: "ATTENDED" },
          clients[5]!.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/bookings/" + r.data.id + "/attendance",
          "POST",
          { version: r.data.version, status: "ATTENDED" },
          trainerCookie,
        )
      ).status,
    ).toBe(409);
    const marked = await call(
      "/bookings/" + r.data.id + "/attendance",
      "POST",
      {
        version: r.data.version,
        status: "ATTENDED",
        correction: true,
        reason: "Восстановлена отметка администратора",
      },
    );
    expect(marked.status).toBe(201);
    expect(marked.data.balanceState).toBe("CONSUMED");
    const revised = await call(
      "/bookings/" + r.data.id + "/attendance",
      "POST",
      {
        version: marked.data.version,
        status: "NO_SHOW",
        correction: true,
        reason: "Исправление неверной отметки",
      },
    );
    expect(revised.status).toBe(201);
    expect(
      await db.membershipLedger.count({
        where: { bookingId: r.data.id, kind: "CONSUME" },
      }),
    ).toBe(1);
    const restored = await call(
      "/bookings/" + r.data.id + "/restore-visit",
      "POST",
      { version: revised.data.version, reason: "Ошибочное списание посещения" },
    );
    expect(restored.status).toBe(201);
    expect(restored.data.balanceState).toBe("NONE");
  });
  it("blocks a freeze covering confirmed bookings and archive with obligations", async () => {
    const s = await session(9),
      r = await book(6, s.id);
    expect(r.status).toBe(201);
    const freeze = await call(
      "/memberships/" + clients[6]!.membershipId + "/freezes",
      "POST",
      { startDate: day(9), endDate: day(10) },
      clients[6]!.cookie,
    );
    expect(freeze.data.error.code).toBe("FREEZE_BOOKINGS");
    const c = await db.clientProfile.findUnique({
      where: { id: clients[6]!.id },
    });
    expect(
      (
        await call("/catalog/clients/" + c.id + "/archive", "POST", {
          version: c.version,
          archived: true,
          reason: "Проверка обязательств",
        })
      ).data.error.code,
    ).toBe("CLIENT_OBLIGATIONS");
  });
  it("refuses moves that cause client overlap or exceed membership expiry", async () => {
    const a = await session(10, 12),
      b = await session(10, 15, 1, 1);
    await book(7, a.id);
    await book(7, b.id);
    const dto = {
      version: a.version,
      scope: "ONE",
      data: {
        workoutId,
        trainerId: trainers[0],
        hallId: halls[0],
        capacity: 1,
        status: "PUBLISHED",
        startAt: at(10, 15).toISOString(),
        endAt: new Date(at(10, 15).getTime() + 3600000).toISOString(),
      },
      reason: "Перенос времени",
    };
    expect(
      (await call("/schedule/" + a.id + "/edit", "POST", dto)).data.error.code,
    ).toBe("CLIENT_CONFLICT");
    const expired = {
      ...dto,
      data: {
        ...dto.data,
        startAt: at(31, 15).toISOString(),
        endAt: new Date(at(31, 15).getTime() + 3600000).toISOString(),
      },
    };
    expect(
      (await call("/schedule/" + a.id + "/preview", "POST", expired)).data.error
        .code,
    ).toBe("BOOKING_ENTITLEMENT");
    expect(
      (
        await db.scheduledSession.findUnique({ where: { id: a.id } })
      ).startAt.toISOString(),
    ).toBe(at(10, 12).toISOString());
  });
  it("includes future bookings in refund preview and releases them only on confirmed refund", async () => {
    const c = clients[8]!,
      o = await call("/orders", "POST", {
        clientId: c.id,
        planVersionId,
        activationDate: day(0),
      }),
      p = await call("/orders/" + o.data.id + "/manual-payment", "POST", {
        method: "CASH",
        reason: "Оплата на рецепции",
      });
    expect(p.status).toBe(201);
    const m = await db.membership.findUnique({ where: { orderId: o.data.id } }),
      s = await session(11),
      b = await book(8, s.id, false, m.id);
    expect(b.status).toBe(201);
    const body = {
        amountMinor: 500000,
        entitlementAction: "CANCEL",
        reason: "Заявление клиента",
      },
      preview = await call(
        "/payments/" + p.data.id + "/refund-preview",
        "POST",
        body,
      );
    expect(preview.data.bookings.map((r: { id: string }) => r.id)).toContain(
      b.data.id,
    );
    const refund = await call("/payments/" + p.data.id + "/refunds", "POST", {
      ...body,
      membershipVersion: preview.data.membershipVersion,
    });
    expect(refund.status).toBe(201);
    expect(
      (await db.booking.findUnique({ where: { id: b.data.id } })).status,
    ).toBe("CONFIRMED");
    await db.refund.update({
      where: { id: refund.data.id },
      data: { nextCheckAt: new Date(0) },
    });
    await payments.tick();
    expect(
      (await db.booking.findUnique({ where: { id: b.data.id } })).status,
    ).toBe("CANCELLED_BY_CLUB");
    expect(
      (await db.membership.findUnique({ where: { id: m.id } })).reserved,
    ).toBe(0);
    expect((await call("/public/schedule/" + s.id)).data.freePlaces).toBe(1);
  });
  it("expires waitlist at cutoff and closes unattended bookings once", async () => {
    const s = await session(12),
      a = await book(9, s.id),
      b = await book(10, s.id, true);
    await db.scheduledSession.update({
      where: { id: s.id },
      data: {
        startAt: new Date(Date.now() + 45 * 60000),
        endAt: new Date(Date.now() + 105 * 60000),
      },
    });
    await core.tick();
    expect(
      (await db.booking.findUnique({ where: { id: b.data.id } })).status,
    ).toBe("WAITLIST_EXPIRED");
    await db.scheduledSession.update({
      where: { id: s.id },
      data: {
        startAt: new Date(Date.now() - 27 * 3600000),
        endAt: new Date(Date.now() - 26 * 3600000),
      },
    });
    await core.tick();
    await core.tick();
    expect(
      (await db.booking.findUnique({ where: { id: a.data.id } })).status,
    ).toBe("NO_SHOW");
    expect(
      await db.membershipLedger.count({
        where: { bookingId: a.data.id, kind: "CONSUME" },
      }),
    ).toBe(1);
  });
  it("serializes repeated cancellations racing with queue promotion", async () => {
    const s = await session(13, 16),
      b = await book(13, s.id),
      w = await book(14, s.id, true),
      idem = randomUUID();
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () =>
        call(
          "/bookings/" + b.data.id + "/cancel",
          "POST",
          { version: b.data.version },
          clients[13]!.cookie,
          idem,
        ),
      ),
      core.promote(w.data.id),
    ]);
    expect(results.slice(0, 8).every((r) => r.status === 201)).toBe(true);
    await Promise.all([core.tick(), core.tick()]);
    expect(
      (await db.booking.findUnique({ where: { id: w.data.id } })).status,
    ).toBe("CONFIRMED");
    expect(
      await db.membershipLedger.count({
        where: { bookingId: w.data.id, kind: "RESERVE" },
      }),
    ).toBe(1);
    expect(
      await db.membershipLedger.count({
        where: { bookingId: b.data.id, kind: "RELEASE" },
      }),
    ).toBe(1);
  });
  it("can book a released place after queue cutoff without waiting for worker", async () => {
    const s = await session(13, 19),
      b = await book(15, s.id),
      w = await book(16, s.id, true);
    await call(
      "/bookings/" + b.data.id + "/cancel",
      "POST",
      { version: b.data.version },
      clients[15]!.cookie,
    );
    await db.scheduledSession.update({
      where: { id: s.id },
      data: {
        startAt: new Date(Date.now() + 50 * 60000),
        endAt: new Date(Date.now() + 110 * 60000),
      },
    });
    const result = await book(16, s.id);
    expect(result.status).toBe(201);
    expect(result.data.id).toBe(w.data.id);
    expect(result.data.status).toBe("CONFIRMED");
  });
  it("scopes client details and trainer roster without leaking foreign records", async () => {
    const s = await session(13, 12, 1, 1),
      b = await book(11, s.id);
    expect(
      (
        await call(
          "/bookings/" + b.data.id,
          "GET",
          undefined,
          clients[12]!.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (await call("/bookings/" + b.data.id, "GET", undefined, trainerCookie))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          "/bookings?sessionId=" + s.id,
          "GET",
          undefined,
          trainerCookie,
        )
      ).data.items,
    ).toEqual([]);
  });
});
