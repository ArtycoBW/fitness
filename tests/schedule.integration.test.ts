import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto");
const db = new Db(),
  key = randomUUID(),
  base = "http://localhost:4100/api/v1";
let server: ChildProcess,
  owner = "",
  trainerCookie = "",
  trainerId = "",
  hallId = "",
  hall2Id = "",
  workoutId = "",
  sessionId = "",
  draftId = "",
  seriesId = "",
  seriesFirst = "",
  seriesVersion = 1;
const DAY = 86400000,
  day = (n: number) =>
    new Date(Date.now() + n * DAY + 10800000).toISOString().slice(0, 10),
  at = (n: number, time = "12:00") =>
    new Date(day(n) + "T" + time + ":00+03:00").toISOString();
const slot = (n = 2, time = "12:00") => ({
  workoutId,
  trainerId,
  hallId,
  startAt: at(n, time),
  endAt: new Date(new Date(at(n, time)).getTime() + 3600000).toISOString(),
  capacity: 10,
  status: "PUBLISHED",
});
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = owner,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": "csrf",
      "Idempotency-Key": randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
beforeAll(async () => {
  for (const role of ["OWNER", "TRAINER"]) {
    const raw = randomUUID();
    const user = await db.user.create({
      data: {
        name: "Расписание " + role,
        email: "schedule-" + role + "-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: { role } },
        ...(role === "TRAINER"
          ? {
              trainer: {
                create: {
                  slug: "schedule-" + key,
                  specialties: ["Пилатес"],
                  workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
                    day,
                    start: 420,
                    end: 1320,
                  })),
                },
              },
            }
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
    if (role === "OWNER") owner = "fitness_session=" + raw;
    else {
      trainerCookie = "fitness_session=" + raw;
      trainerId = user.trainer.id;
    }
  }
  const h = await db.hall.create({
    data: {
      name: "Зал расписания",
      slug: "schedule-" + key,
      capacity: 12,
      equipment: ["Коврики"],
      published: true,
    },
  });
  hallId = h.id;
  hall2Id = (
    await db.hall.create({
      data: {
        name: "Второй зал",
        slug: "schedule-two-" + key,
        capacity: 12,
        equipment: ["Коврики"],
        published: true,
      },
    })
  ).id;
  workoutId = (
    await db.workoutType.create({
      data: {
        name: "Пилатес",
        slug: "schedule-" + key,
        category: "Пилатес",
        equipment: ["Коврики"],
        published: true,
      },
    })
  ).id;
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
describe.sequential(
  "Schedule resource exclusion and series transactions",
  () => {
    it("creates a published session and blocks resource collisions", async () => {
      const r = await call("/schedule", "POST", slot());
      expect(r.status).toBe(201);
      sessionId = r.data.id;
      expect((await call("/schedule", "POST", slot())).status).toBe(409);
      expect(
        (await call("/schedule", "POST", { ...slot(), hallId: hall2Id }))
          .status,
      ).toBe(409);
    });
    it("permits adjacent intervals and keeps drafts out of public calendar", async () => {
      expect((await call("/schedule", "POST", slot(2, "13:00"))).status).toBe(
        201,
      );
      const draft = await call("/schedule", "POST", {
        ...slot(),
        status: "DRAFT",
      });
      expect(draft.status).toBe(201);
      draftId = draft.data.id;
      expect((await call("/public/schedule/" + draftId)).status).toBe(404);
      expect(
        (
          await call("/schedule/" + draftId + "/edit", "POST", {
            version: 1,
            scope: "ONE",
            data: slot(),
            reason: "Публикация черновика",
          })
        ).status,
      ).toBe(409);
    });
    it("checks room capacity, trainer hours and roles", async () => {
      expect(
        (await call("/schedule", "POST", { ...slot(3), capacity: 13 })).status,
      ).toBe(422);
      expect((await call("/schedule", "POST", slot(3, "04:00"))).status).toBe(
        422,
      );
      expect(
        (await call("/schedule", "POST", slot(3), trainerCookie)).status,
      ).toBe(403);
    });
    it("prevents closing or shrinking a room across an existing session", async () => {
      expect(
        (
          await call("/catalog/halls/" + hallId + "/closures", "POST", {
            startAt: at(2, "11:30"),
            endAt: at(2, "12:30"),
            reason: "Техническое закрытие",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await call("/catalog/halls/" + hallId, "PATCH", {
            version: 1,
            data: {
              name: "Зал расписания",
              slug: "schedule-" + key,
              capacity: 2,
              equipment: ["Коврики"],
              published: true,
            },
          })
        ).status,
      ).toBe(422);
      expect(
        (await db.hall.findUnique({ where: { id: hallId } })).capacity,
      ).toBe(12);
      expect(
        (
          await call("/catalog/halls/" + hallId + "/archive", "POST", {
            version: 1,
            archived: true,
            reason: "Закрытие зала",
          })
        ).status,
      ).toBe(409);
    });
    it("uses trainer absence as an occupied interval", async () => {
      expect(
        (
          await call(
            "/trainer/availability",
            "POST",
            {
              startAt: at(2, "12:00"),
              endAt: at(2, "14:00"),
              reason: "Отпуск",
            },
            trainerCookie,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await call(
            "/trainer/availability",
            "POST",
            {
              startAt: at(3, "12:00"),
              endAt: at(3, "14:00"),
              reason: "Отпуск",
            },
            trainerCookie,
          )
        ).status,
      ).toBe(201);
      expect((await call("/schedule", "POST", slot(3))).status).toBe(409);
    });
    it("previews and creates a finite series with one occurrence per date", async () => {
      const body = {
        workoutId,
        trainerId,
        hallId,
        capacity: 10,
        status: "PUBLISHED",
        startDate: day(7),
        endDate: day(9),
        startTime: "10:00",
        durationMinutes: 60,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        excludedDates: [],
      };
      expect(
        (await call("/schedule/series/preview", "POST", body)).data.count,
      ).toBe(3);
      const result = await call("/schedule/series", "POST", body);
      expect(result.status).toBe(201);
      seriesId = result.data.seriesId;
      seriesFirst = result.data.items[0].id;
      seriesVersion = result.data.items[0].version;
      expect(await db.scheduledSession.count({ where: { seriesId } })).toBe(3);
      expect(
        (await call("/schedule/series", "POST", { ...body, endDate: day(90) }))
          .status,
      ).toBe(422);
    });
    it("rolls back a complete series move when its last occurrence conflicts", async () => {
      expect((await call("/schedule", "POST", slot(9, "20:00"))).status).toBe(
        201,
      );
      const body = {
        version: seriesVersion,
        scope: "FUTURE",
        data: slot(7, "20:00"),
        reason: "Изменение расписания",
      };
      expect(
        (await call("/schedule/" + seriesFirst + "/edit", "POST", body)).status,
      ).toBe(409);
      const rows = await db.scheduledSession.findMany({ where: { seriesId } });
      expect(
        rows.every(
          (s: { startAt: Date }) =>
            s.startAt.toISOString().slice(11, 16) === "07:00",
        ),
      ).toBe(true);
    });
    it("keeps exactly one session when two requests race for the same resources", async () => {
      const result = await Promise.all([
        call("/schedule", "POST", slot(4)),
        call("/schedule", "POST", slot(4)),
      ]);
      expect(result.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await db.scheduledSession.count({
          where: { hallId, startAt: new Date(at(4)), status: "PUBLISHED" },
        }),
      ).toBe(1);
    });
    it("validates dates and hides staff identity data from public projection", async () => {
      expect(
        (await call("/public/schedule?from=" + day(0) + "&to=" + day(100)))
          .status,
      ).toBe(400);
      const r = await call("/public/schedule/" + sessionId);
      expect(r.status).toBe(200);
      expect(r.data.trainer.user.email).toBeUndefined();
      expect(r.data.trainer.user.passwordHash).toBeUndefined();
    });
    it("cancels an absence and releases its occupancy without permitting another trainer", async () => {
      const period = await call(
        "/trainer/availability",
        "POST",
        {
          startAt: at(12, "15:00"),
          endAt: at(12, "16:00"),
          reason: "Личный перерыв",
        },
        trainerCookie,
      );
      expect(period.status).toBe(201);
      const absence = await db.trainerAbsence.findFirstOrThrow({
        where: { trainerId, startAt: new Date(at(12, "15:00")) },
      });
      expect((await call("/schedule", "POST", slot(12, "15:00"))).status).toBe(
        409,
      );
      expect(
        (
          await call(
            "/trainer/availability/" + absence.id + "/cancel",
            "POST",
            { reason: "Планы изменились" },
            trainerCookie,
          )
        ).status,
      ).toBe(201);
      expect((await call("/schedule", "POST", slot(12, "15:00"))).status).toBe(
        201,
      );
      expect(
        (
          await call(
            "/trainer/availability/" + absence.id + "/cancel",
            "POST",
            { reason: "Повторная отмена" },
            trainerCookie,
          )
        ).status,
      ).toBe(404);
    });
    it("releases occupied intervals when a session is cancelled", async () => {
      expect(
        (
          await call("/schedule/" + sessionId + "/cancel", "POST", {
            version: 1,
            scope: "ONE",
            reason: "Отмена клубом",
          })
        ).status,
      ).toBe(201);
      expect((await call("/schedule", "POST", slot())).status).toBe(201);
      expect(
        (await db.hallOccupancy.findUnique({ where: { sessionId } })).active,
      ).toBe(false);
    });
  },
);

it("bounds public schedule reads to 31 calendar days", async () => {
  expect(
    (await call("/public/schedule?from=" + day(0) + "&to=" + day(31))).status,
  ).toBe(400);
  expect(
    (await call("/public/schedule?from=" + day(0) + "&to=" + day(30))).status,
  ).toBe(200);
});
