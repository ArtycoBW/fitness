import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto"),
  { atomic } = require("../apps/api/dist/common/transaction"),
  {
    EntitlementService,
  } = require("../apps/api/dist/modules/memberships/entitlement.service"),
  {
    NotificationService,
    notifyUser,
  } = require("../apps/api/dist/modules/notifications/notification.service"),
  {
    ReportService,
  } = require("../apps/api/dist/modules/operations/report.service"),
  {
    ExportService,
    csvCell,
  } = require("../apps/api/dist/modules/operations/export.service"),
  {
    OutboxService,
  } = require("../apps/api/dist/modules/notifications/outbox.service"),
  db = new Db(),
  rights = new EntitlementService(),
  notices = new NotificationService(db),
  reports = new ReportService(db),
  exports = new ExportService(db, reports),
  key = randomUUID(),
  base = "http://localhost:4100/api/v1";
let server: ChildProcess,
  owner = "",
  client = "",
  reception = "",
  trainer = "",
  ownerId = "",
  clientId = "",
  userId = "",
  trainerId = "",
  receptionId = "",
  memberId = "",
  bookingId = "",
  lateBookingId = "",
  exportId = "";
const now = new Date(),
  today = new Date(now.getTime() + 10800000).toISOString().slice(0, 10),
  terms = {
    title: "Контрольный абонемент",
    description: "Программа посещений",
    priceMinor: 100000,
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
async function fixture(role: string, name: string) {
  const raw = randomUUID(),
    u = await db.user.create({
      data: {
        name,
        email: name + "-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: now,
        roles: { create: { role } },
        ...(role === "CLIENT"
          ? { client: { create: { name: "=SUM(1,2)", phone: "+79991234567" } } }
          : {}),
        ...(role === "TRAINER"
          ? { trainer: { create: { slug: "ops-" + key } } }
          : {}),
      },
      include: { client: true, trainer: true },
    });
  await db.authSession.create({
    data: {
      userId: u.id,
      tokenHash: digest(raw),
      csrfHash: digest("csrf"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { u, cookie: "fitness_session=" + raw };
}
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
      Cookie: cookie,
      "X-CSRF-Token": "csrf",
      "Content-Type": "application/json",
      "Idempotency-Key": idem,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const _auth = () => ({
  id: ownerId,
  name: "Владелец",
  roles: ["OWNER"],
  clientId: null,
  trainerId: null,
});
beforeAll(async () => {
  const o = await fixture("OWNER", "ops-owner");
  owner = o.cookie;
  ownerId = o.u.id;
  const c = await fixture("CLIENT", "ops-client");
  client = c.cookie;
  clientId = c.u.client.id;
  userId = c.u.id;
  const t = await fixture("TRAINER", "ops-trainer");
  trainer = t.cookie;
  trainerId = t.u.trainer.id;
  const r = await fixture("RECEPTION", "ops-reception");
  reception = r.cookie;
  receptionId = r.u.id;
  const plan = await db.membershipPlan.create({
      data: { name: "Контроль отчёта", slug: "ops-" + key },
    }),
    { workoutIds: _w, hallIds: _h, trainerIds: _t, ...columns } = terms,
    version = await db.membershipPlanVersion.create({
      data: { ...columns, planId: plan.id, number: 1 },
    });
  async function payment(amount: number, date: string, actor: string) {
    const order = await db.order.create({
      data: {
        clientId,
        planVersionId: version.id,
        totalMinor: amount,
        status: "PAID",
        paidAt: new Date(date),
        activationDate: new Date(today + "T00:00:00+03:00"),
        productSnapshot: terms,
        expiresAt: new Date(now.getTime() + 3600000),
        createdBy: actor,
      },
    });
    const p = await db.paymentAttempt.create({
      data: {
        orderId: order.id,
        method: "CASH",
        amountMinor: amount,
        status: "SUCCEEDED",
        confirmedAt: new Date(date),
      },
    });
    return { p, order };
  }
  const first = await payment(100000, "2025-04-15T00:00:00+03:00", ownerId),
    second = await payment(200000, "2025-04-14T23:59:59+03:00", ownerId);
  await payment(30000, "2025-04-15T12:00:00+03:00", receptionId);
  await db.refund.create({
    data: {
      paymentId: second.p.id,
      amountMinor: 50000,
      status: "SUCCEEDED",
      reason: "Контроль возврата",
      entitlementAction: "KEEP",
      requestedBy: ownerId,
      completedAt: new Date("2025-04-15T23:59:59+03:00"),
    },
  });
  memberId = (
    await atomic(db, (tx: typeof db) => rights.issue(tx, first.order.id))
  ).id;
  const hall = await db.hall.create({
      data: { name: "Контрольный зал", slug: "ops-" + key, capacity: 10 },
    }),
    workout = await db.workoutType.create({
      data: {
        name: "Контрольное занятие",
        slug: "ops-" + key,
        category: "Сила",
      },
    });
  for (let i = 0; i < 2; i++) {
    const startAt = new Date(
        now.getTime() + (i === 0 ? 24 * 3600000 - 60000 : 23 * 3600000),
      ),
      s = await db.scheduledSession.create({
        data: {
          workoutId: workout.id,
          trainerId,
          hallId: hall.id,
          startAt,
          endAt: new Date(startAt.getTime() + 1800000),
          capacity: 10,
          status: "PUBLISHED",
          policySnapshot: { cancelMinutes: 120 },
        },
      });
    const b = await atomic(db, async (tx: typeof db) => {
      const b = await tx.booking.create({
        data: {
          clientId,
          sessionId: s.id,
          membershipId: memberId,
          status: "CONFIRMED",
          balanceState: "RESERVED",
          createdAt: i === 0 ? new Date(now.getTime() - 3600000) : now,
        },
      });
      await rights.movement(
        tx,
        memberId,
        "RESERVE",
        "ops:" + b.id,
        ownerId,
        b.id,
      );
      return b;
    });
    if (i === 0) bookingId = b.id;
    else lateBookingId = b.id;
  }
  server = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, API_PORT: "4100" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health/ready")).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("API not ready");
}, 30000);
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
describe.sequential("Operations and reports", () => {
  it("reconciles cash flows using confirmation timestamps and actor scope", async () => {
    const q = `/reports?kind=FINANCE&from=2025-04-15&to=2025-04-15&staffId=${ownerId}`,
      r = await call(q);
    expect(r.status).toBe(200);
    expect(r.data.summary).toEqual({
      incomeMinor: 100000,
      refundsMinor: 50000,
      netMinor: 50000,
    });
    expect(r.data.total).toBe(2);
    expect(
      r.data.items.reduce(
        (s: number, r: { amount: number }) => s + r.amount,
        0,
      ),
    ).toBe(50000);
    const own = await call(
      "/reports?kind=FINANCE&from=2025-04-15&to=2025-04-15",
      "GET",
      undefined,
      reception,
    );
    expect(own.data.summary.incomeMinor).toBe(30000);
    expect((await call(q, "GET", undefined, reception)).status).toBe(403);
    expect((await call(q, "GET", undefined, trainer)).status).toBe(403);
    expect((await call(q, "GET", undefined, client)).status).toBe(403);
  });
  it("exports asynchronously with formula protection and current permission checks", async () => {
    expect(csvCell(" \t=SUM(1,2)")).toBe('"\' \t=SUM(1,2)"');
    expect(csvCell(-50000)).toBe('"-50000"');
    const r = await call("/exports", "POST", {
      kind: "FINANCE",
      from: "2025-04-15",
      to: "2025-04-15",
      staffId: ownerId,
    });
    expect(r.status).toBe(201);
    exportId = r.data.id;
    await exports.tick();
    const jobs = (await call("/exports")).data;
    expect(jobs.find((j: { id: string }) => j.id === exportId).status).toBe(
      "READY",
    );
    const download = await fetch(base + "/exports/" + exportId + "/download", {
        headers: { Cookie: owner },
      }),
      csv = await download.text();
    expect(download.status).toBe(200);
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv).toContain("-50000");
    expect(
      (
        await fetch(base + "/exports/" + exportId + "/download", {
          headers: { Cookie: reception },
        })
      ).status,
    ).toBe(404);
  });
  it("deduplicates reminders and does not backfill reminders for late bookings", async () => {
    await notices.tick(now);
    await notices.tick(now);
    const rows = await db.notification.findMany({
      where: { recipientId: userId, type: "REMINDER" },
    });
    expect(
      rows.filter((n: { eventKey: string }) =>
        n.eventKey.startsWith("reminder:" + bookingId + ":"),
      ),
    ).toHaveLength(1);
    expect(
      rows.filter((n: { eventKey: string }) =>
        n.eventKey.startsWith("reminder:" + lateBookingId + ":"),
      ),
    ).toHaveLength(0);
    expect(
      await db.outboxEvent.count({ where: { dedupKey: rows[0].eventKey } }),
    ).toBe(1);
  });
  it("honors channel preferences and scopes read markers", async () => {
    expect(
      (
        await call(
          "/me/notification-preferences",
          "PUT",
          {
            bookingEmail: false,
            programEmail: true,
            paymentEmail: true,
            reminderEmail: true,
            reminders: true,
          },
          client,
        )
      ).status,
    ).toBe(200);
    await atomic(db, (tx: typeof db) =>
      notifyUser(tx, userId, {
        type: "BOOKING",
        title: "Изменение",
        text: "Новое время",
        href: "/account/bookings/" + bookingId,
        eventKey: "ops-pref:" + key,
      }),
    );
    expect(
      await db.outboxEvent.count({ where: { dedupKey: "ops-pref:" + key } }),
    ).toBe(0);
    const list = (await call("/notifications", "GET", undefined, client)).data;
    expect(list.unread).toBeGreaterThan(0);
    await call(
      "/notifications/" + list.items[0].id + "/read",
      "POST",
      {},
      reception,
    );
    expect(
      (await db.notification.findUnique({ where: { id: list.items[0].id } }))
        .readAt,
    ).toBeNull();
    await call("/notifications/read-all", "POST", {}, client);
    expect(
      (await call("/notifications", "GET", undefined, client)).data.unread,
    ).toBe(0);
  });
  it("preserves events and retries safely after mail delivery fails", async () => {
    await atomic(db, (tx: typeof db) =>
      notifyUser(tx, userId, {
        type: "PAYMENT",
        title: "Оплата",
        text: "Подтверждена",
        href: "/account/payments",
        eventKey: "ops-failure:" + key,
      }),
    );
    const event = await db.outboxEvent.findUnique({
      where: { dedupKey: "ops-failure:" + key },
    });
    await db.outboxEvent.update({
      where: { id: event.id },
      data: { attempts: 5, availableAt: new Date(0), createdAt: new Date(0) },
    });
    const outbox = new OutboxService(db);
    outbox.transport = {
      sendMail: async () => {
        throw Error("Offline");
      },
    };
    await outbox.tick();
    const dead = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(dead.status).toBe("DEAD");
    expect(
      (await db.booking.findUnique({ where: { id: bookingId } })).status,
    ).toBe("CONFIRMED");
    expect(
      (await call("/deliveries/" + event.id + "/retry", "POST")).status,
    ).toBe(201);
    expect(
      (await db.outboxEvent.findUnique({ where: { id: event.id } })).status,
    ).toBe("PENDING");
    expect((await call("/deliveries", "GET", undefined, client)).status).toBe(
      403,
    );
    expect((await call("/deliveries")).data.items[0]).not.toHaveProperty(
      "payload",
    );
  });
  it("accepts an idempotent contact, enforces consent and records workflow changes", async () => {
    const body = {
        name: "Гость " + key,
        phone: "+79991234567",
        message: "Хочу познакомиться с клубом",
        consent: true,
      },
      idem = randomUUID();
    expect(
      (
        await call(
          "/public/leads",
          "POST",
          { ...body, consent: false },
          "",
          randomUUID(),
        )
      ).status,
    ).toBe(400);
    const first = await call("/public/leads", "POST", body, "", idem),
      again = await call("/public/leads", "POST", body, "", idem);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    const list = (await call("/leads?q=" + key)).data;
    expect(list.total).toBe(1);
    const id = list.items[0].id;
    expect(
      (
        await call(
          "/leads/" + id,
          "PUT",
          {
            version: 1,
            status: "CONTACTED",
            assignedTo: receptionId,
            note: "Обсудили первое занятие",
          },
          reception,
        )
      ).status,
    ).toBe(200);
    const detail = (await call("/leads/" + id)).data;
    expect(detail.events).toHaveLength(2);
    expect((await call("/leads/" + id, "GET", undefined, client)).status).toBe(
      403,
    );
    expect(
      (
        await call("/leads/" + id, "PUT", {
          version: 1,
          status: "CLOSED",
          assignedTo: null,
          note: "Устаревшая вкладка",
        })
      ).status,
    ).toBe(409);
  });
  it("versions club policy without changing published session snapshots and keeps audit immutable", async () => {
    const original = (await call("/settings")).data,
      updated = {
        ...original.data,
        bookingPolicy: { ...original.data.bookingPolicy, cancelMinutes: 123 },
      };
    expect(
      (
        await call("/settings", "PUT", {
          version: original.version,
          data: updated,
          reason: "Проверка снимка политики",
        })
      ).status,
    ).toBe(200);
    const s = await db.booking.findUnique({
      where: { id: bookingId },
      include: { session: true },
    });
    expect(s.session.policySnapshot.cancelMinutes).toBe(120);
    const current = (await call("/settings")).data;
    await call("/settings", "PUT", {
      version: current.version,
      data: original.data,
      reason: "Восстановление политики после проверки",
    });
    const audits = (await call("/audit?q=CLUB_SETTINGS_UPDATED")).data.items;
    expect(audits[0].requestId).toBeTruthy();
    await expect(
      db.auditLog.update({
        where: { id: audits[0].id },
        data: { reason: "Подмена" },
      }),
    ).rejects.toThrow();
    expect(
      (
        await call("/settings", "PUT", {
          version: current.version,
          data: updated,
          reason: "Устаревшая вкладка",
        })
      ).status,
    ).toBe(409);
  });
  it("reports no attendance denominator for future bookings and scopes coach resources", async () => {
    const url = `/reports?kind=ATTENDANCE&from=${today}&to=${new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10)}`;
    const r = await call(url + "&area=trainer", "GET", undefined, trainer);
    expect(r.status).toBe(200);
    expect(r.data.summary.attendanceRate).toBeNull();
    const resources = await call(
      url.replace("ATTENDANCE", "RESOURCES") + "&area=trainer",
      "GET",
      undefined,
      trainer,
    );
    expect(resources.status).toBe(200);
    expect(resources.data.items).toHaveLength(2);
    expect(resources.data.items[0].atStart).toBeNull();
    expect((await call(url.replace("ATTENDANCE", "MEMBERSHIPS"))).status).toBe(
      200,
    );
  });
});
