import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { Db } = require("../apps/api/dist/db");
const { digest } = require("../apps/api/dist/common/crypto");
const db = new Db(),
  key = randomUUID(),
  base = "http://localhost:4100/api/v1";
let server: ChildProcess;
const people: Record<
  string,
  { id: string; cookie: string; trainerId?: string }
> = {};
const sessions: Record<string, string> = {};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  role = "ADMIN",
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      Cookie: people[role]!.cookie,
      "X-CSRF-Token": "csrf",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
beforeAll(async () => {
  for (const role of [
    "ADMIN",
    "OWNER",
    "TRAINER",
    "CLIENT",
    "RECEPTION",
    "MULTI",
  ]) {
    const raw = randomUUID();
    const user = await db.user.create({
      data: {
        name: "Hours " + role,
        email: `${role}-hours-${key}@example.com`,
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: {
          create: (role === "MULTI" ? ["ADMIN", "TRAINER"] : [role]).map(
            (role) => ({ role }),
          ),
        },
        ...(["TRAINER", "MULTI"].includes(role)
          ? { trainer: { create: { slug: `${role}-${key}` } } }
          : {}),
      },
      include: { trainer: true },
    });
    await db.authSession.create({
      data: {
        userId: user.id,
        tokenHash: digest(raw),
        csrfHash: digest("csrf"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    people[role] = {
      id: user.id,
      cookie: "fitness_session=" + raw,
      trainerId: user.trainer?.id,
    };
  }
  const hall = await db.hall.create({
    data: { name: "Hours", slug: key, capacity: 10 },
  });
  const workout = await db.workoutType.create({
    data: { name: "Hours", slug: key, category: "Yoga" },
  });
  for (const [name, start, minutes, status, trainer] of [
    ["past", "2020-01-02T12:00:00+03:00", 45, "PUBLISHED", "TRAINER"],
    ["boundary", "2020-01-01T21:15:00Z", 90, "COMPLETED", "TRAINER"],
    ["cancelled", "2020-01-02T14:00:00+03:00", 60, "CANCELLED", "TRAINER"],
    ["draft", "2020-01-02T16:00:00+03:00", 60, "DRAFT", "TRAINER"],
    ["future", "2099-01-02T12:00:00+03:00", 60, "PUBLISHED", "TRAINER"],
    ["other", "2020-01-02T18:00:00+03:00", 60, "PUBLISHED", "MULTI"],
  ] as const) {
    const s = await db.scheduledSession.create({
      data: {
        workoutId: workout.id,
        hallId: hall.id,
        trainerId: people[trainer]!.trainerId,
        startAt: new Date(start),
        endAt: new Date(Date.parse(start) + minutes * 60000),
        status,
        capacity: 10,
        policySnapshot: {},
      },
    });
    sessions[name] = s.id;
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
  throw new Error("API did not start");
});
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
const reportPath = () =>
  `/analytics/trainer-hours?from=2020-01-02&to=2020-01-02&trainerId=${people.TRAINER!.trainerId}`;
const recordPath = (name = "past") =>
  `/analytics/trainer-hours/${sessions[name]}`;
describe.sequential("Trainer access and worked hours", () => {
  it("allows admins to grant trainer role without removing client rights", async () => {
    const result = await call(`/users/${people.CLIENT!.id}/roles`, "PUT", {
      roles: ["CLIENT", "TRAINER"],
    });
    expect(result.status).toBe(200);
    expect(
      await db.trainerProfile.count({ where: { userId: people.CLIENT!.id } }),
    ).toBe(1);
    expect(
      await db.userRole.count({ where: { userId: people.CLIENT!.id } }),
    ).toBe(2);
    expect(
      await db.authSession.count({
        where: { userId: people.CLIENT!.id, revokedAt: null },
      }),
    ).toBe(0);
  });
  it("prevents privilege escalation, changing owners, and changing own roles", async () => {
    expect(
      (
        await call(`/users/${people.CLIENT!.id}/roles`, "PUT", {
          roles: ["CLIENT", "ADMIN"],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`/users/${people.OWNER!.id}/roles`, "PUT", {
          roles: ["TRAINER"],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`/users/${people.ADMIN!.id}/roles`, "PUT", {
          roles: ["TRAINER"],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(
          `/users/${people.CLIENT!.id}/roles`,
          "PUT",
          { roles: ["CLIENT"] },
          "TRAINER",
        )
      ).status,
    ).toBe(403);
  });
  it("scopes personal schedules even for users with admin and trainer roles", async () => {
    const path = `/schedule?from=2020-01-02&to=2020-01-02&area=trainer&trainerId=${people.TRAINER!.trainerId}`;
    const result = await call(path, "GET", undefined, "MULTI");
    expect(result.status).toBe(200);
    expect(result.data.map((s: { id: string }) => s.id)).toEqual([
      sessions.other,
    ]);
    expect(
      (
        await call(
          `/schedule/${sessions.past}?area=trainer`,
          "GET",
          undefined,
          "MULTI",
        )
      ).status,
    ).toBe(404);
  });
  it("blocks hours reports and changes for trainers and reception", async () => {
    for (const role of ["TRAINER", "RECEPTION"]) {
      expect((await call(reportPath(), "GET", undefined, role)).status).toBe(
        403,
      );
      expect(
        (await call(recordPath(), "PUT", { minutes: 45, version: 0 }, role))
          .status,
      ).toBe(403);
    }
  });
  it("uses Moscow dates and excludes draft/cancelled sessions", async () => {
    const r = await call(reportPath());
    expect(r.status).toBe(200);
    expect(r.data.summary).toMatchObject({
      sessions: 2,
      pending: 2,
      workedMinutes: 0,
      occupancy: 0,
    });
    expect(r.data.trainers[0].scheduledMinutes).toBe(135);
    expect(
      (await call("/analytics/trainer-hours?from=2020-01-01&to=2021-01-01"))
        .status,
    ).toBe(400);
  });
  it("records minutes, rejects stale updates and requires a reason for corrections", async () => {
    const saved = await call(recordPath(), "PUT", { minutes: 45, version: 0 });
    expect(saved.status).toBe(200);
    expect(
      (await call(recordPath(), "PUT", { minutes: 45, version: 0 })).status,
    ).toBe(409);
    expect(
      (await call(recordPath(), "PUT", { minutes: 75, version: 1 })).status,
    ).toBe(422);
    expect(
      (
        await call(recordPath(), "PUT", {
          minutes: 75,
          note: "Продлили занятие",
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect((await call(reportPath())).data.summary).toMatchObject({
      workedMinutes: 75,
      pending: 1,
    });
    expect(
      await db.trainerWorkLog.count({ where: { sessionId: sessions.past } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityId: sessions.past, action: "TRAINER_HOURS_RECORDED" },
      }),
    ).toBe(2);
  });
  it("rejects future, draft, cancelled sessions and invalid durations", async () => {
    for (const name of ["future", "draft", "cancelled"])
      expect(
        (await call(recordPath(name), "PUT", { minutes: 60, version: 0 }))
          .status,
      ).toBe(422);
    for (const minutes of [-1, 1441, 1.5])
      expect(
        (await call(recordPath("boundary"), "PUT", { minutes, version: 0 }))
          .status,
      ).toBe(400);
  });
  it("accounts for zero minutes without duplicating or deleting history", async () => {
    expect(
      (
        await call(recordPath("boundary"), "PUT", {
          minutes: 0,
          note: "Занятие не состоялось",
          version: 0,
        })
      ).status,
    ).toBe(200);
    expect((await call(reportPath())).data.summary).toMatchObject({
      workedMinutes: 75,
      pending: 0,
    });
  });
});
