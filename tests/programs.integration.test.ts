import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto"),
  db = new Db(),
  base = "http://localhost:4100/api/v1",
  key = randomUUID();
let server: ChildProcess,
  owner = "",
  trainer = "",
  stranger = "",
  client = "",
  client2 = "",
  clientId = "",
  otherClientId = "",
  trainerId = "",
  exerciseId = "",
  durationId = "",
  programId = "",
  versionId = "",
  assignmentId = "",
  dayId = "",
  prescribedId = "";
const today = () => new Date(Date.now() + 10800000).toISOString().slice(0, 10);
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = trainer,
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
async function user(role: string, n: string) {
  const raw = randomUUID(),
    u = await db.user.create({
      data: {
        name: n,
        email: n + "-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: { role } },
        ...(role === "TRAINER"
          ? { trainer: { create: { slug: n + "-" + key, active: true } } }
          : role === "CLIENT"
            ? { client: { create: { name: n, phone: "+79991234567" } } }
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
const draft = () => ({
  title: "Основы движения",
  goal: "Регулярные тренировки и контроль техники",
  level: "BEGINNER",
  weeks: 2,
  days: [
    {
      weekNumber: 1,
      dayIndex: 1,
      title: "Сила и устойчивость",
      exercises: [
        {
          exerciseId,
          sets: 2,
          reps: 12,
          durationSeconds: null,
          weightKg: 4,
          restSeconds: 60,
          notes: "Без спешки",
        },
      ],
    },
    {
      weekNumber: 2,
      dayIndex: 1,
      title: "Закрепление",
      exercises: [
        {
          exerciseId: durationId,
          sets: 1,
          reps: null,
          durationSeconds: 30,
          weightKg: null,
          restSeconds: 60,
          notes: "",
        },
      ],
    },
  ],
});
const log = (version = 0) => ({
  version,
  performedOn: today(),
  completed: false,
  comment: "Комфортная нагрузка",
  sets: [
    {
      programExerciseId: prescribedId,
      setIndex: 1,
      actualReps: 11,
      actualSeconds: null,
      actualWeightKg: 4,
    },
  ],
});
beforeAll(async () => {
  owner = (await user("OWNER", "program-owner")).cookie;
  const t = await user("TRAINER", "program-trainer");
  trainer = t.cookie;
  trainerId = t.u.trainer.id;
  stranger = (await user("TRAINER", "program-stranger")).cookie;
  const c = await user("CLIENT", "program-client");
  client = c.cookie;
  clientId = c.u.client.id;
  const other = await user("CLIENT", "program-other");
  client2 = other.cookie;
  otherClientId = other.u.client.id;
  await db.trainerClient.create({ data: { trainerId, clientId } });
  server = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, API_PORT: "4100" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health/ready")).ok) return;
    } catch {
      /* Wait for the isolated API to start. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("API not ready");
}, 30000);
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
describe.sequential("Published programs and execution journal", () => {
  it("enforces catalogue and author roles and validates exercise metrics", async () => {
    expect(
      (
        await call(
          "/exercises",
          "POST",
          {
            name: "Приседание",
            category: "Сила",
            instructions: "Сохраняйте нейтральную спину и устойчивую опору.",
            metricType: "REPS",
          },
          client,
        )
      ).status,
    ).toBe(403);
    const e = await call("/exercises", "POST", {
      name: "Приседание",
      category: "Сила",
      instructions: "Сохраняйте нейтральную спину и устойчивую опору.",
      metricType: "REPS",
    });
    expect(e.status).toBe(201);
    exerciseId = e.data.id;
    durationId = (
      await call("/exercises", "POST", {
        name: "Планка",
        category: "Кор",
        instructions: "Удерживайте корпус ровно, дышите спокойно.",
        metricType: "DURATION",
      })
    ).data.id;
    const invalid = draft();
    invalid.days[0]!.exercises[0]!.exerciseId = durationId;
    expect(
      (await call("/programs", "POST", { draft: invalid })).data.error.code,
    ).toBe("METRIC_MISMATCH");
    const p = await call("/programs", "POST", { draft: draft() });
    expect(p.status).toBe(201);
    programId = p.data.id;
    expect(
      (await call("/programs/" + programId, "GET", undefined, stranger)).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/programs/" + programId,
          "PUT",
          { version: 1, draft: draft() },
          stranger,
        )
      ).status,
    ).toBe(404);
  });
  it("publishes idempotently and retains exact exercise snapshots", async () => {
    const idem = randomUUID(),
      rs = await Promise.all(
        Array.from({ length: 4 }, () =>
          call(
            "/programs/" + programId + "/publish",
            "POST",
            { version: 1 },
            trainer,
            idem,
          ),
        ),
      );
    expect(rs.every((r) => r.status === 201)).toBe(true);
    versionId = rs[0]!.data.id;
    dayId = rs[0]!.data.days[0].id;
    prescribedId = rs[0]!.data.days[0].exercises[0].id;
    expect(await db.programVersion.count({ where: { programId } })).toBe(1);
    await call("/exercises/" + exerciseId, "PUT", {
      version: 1,
      data: {
        name: "Приседание с гантелью",
        category: "Сила",
        instructions: "Обновлённая инструкция к технике выполнения.",
        metricType: "REPS",
      },
    });
    const p = (await call("/programs/" + programId)).data;
    expect(p.versions[0].days[0].exercises[0].exerciseSnapshot.name).toBe(
      "Приседание",
    );
    await expect(
      db.programExercise.update({
        where: { id: prescribedId },
        data: { reps: 99 },
      }),
    ).rejects.toThrow();
    await expect(
      db.programVersion.update({
        where: { id: versionId },
        data: { title: "Подмена" },
      }),
    ).rejects.toThrow();
  });
  it("allows assignment only to an assigned client and exactly once concurrently", async () => {
    const body = { programVersionId: versionId, clientId, startsOn: today() };
    expect(
      (await call("/program-assignments", "POST", body, client)).status,
    ).toBe(403);
    expect(
      (
        await call("/program-assignments", "POST", {
          ...body,
          clientId: otherClientId,
        })
      ).status,
    ).toBe(403);
    const rs = await Promise.all([
      call("/program-assignments", "POST", body),
      call("/program-assignments", "POST", body),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    assignmentId = rs.find((r) => r.status === 201)!.data.id;
    expect(
      (
        await call(
          "/program-assignments/" + assignmentId,
          "GET",
          undefined,
          client2,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/program-assignments/" + assignmentId,
          "GET",
          undefined,
          stranger,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call("/program-assignments", "GET", undefined, client)
      ).data.items.some((a: { id: string }) => a.id === assignmentId),
    ).toBe(true);
  });
  it("isolates private coach comments from client responses", async () => {
    await call("/program-assignments/" + assignmentId + "/comments", "POST", {
      body: "Заметка команды",
      visibility: "TEAM",
    });
    await call("/program-assignments/" + assignmentId + "/comments", "POST", {
      body: "Как прошла тренировка?",
      visibility: "SHARED",
    });
    expect(
      (
        await call(
          "/program-assignments/" + assignmentId,
          "GET",
          undefined,
          client,
        )
      ).data.comments,
    ).toHaveLength(1);
    expect(
      (await call("/program-assignments/" + assignmentId)).data.comments,
    ).toHaveLength(2);
    expect(
      (
        await call(
          "/program-assignments/" + assignmentId + "/comments",
          "POST",
          { body: "Скрытая заметка", visibility: "TEAM" },
          client,
        )
      ).status,
    ).toBe(403);
  });
  it("validates log ownership, metric, set scope, completion and dates", async () => {
    const path = `/program-assignments/${assignmentId}/days/${dayId}/log`;
    expect((await call(path, "PUT", log(), trainer)).status).toBe(403);
    expect((await call(path, "PUT", log(), client2)).status).toBe(404);
    expect(
      (await call(path, "PUT", { ...log(), completed: true }, client)).data
        .error.code,
    ).toBe("SETS_INCOMPLETE");
    expect(
      (
        await call(
          path,
          "PUT",
          {
            ...log(),
            sets: [{ ...log().sets[0], actualReps: null, actualSeconds: 30 }],
          },
          client,
        )
      ).data.error.code,
    ).toBe("METRIC_MISMATCH");
    expect(
      (
        await call(
          path,
          "PUT",
          { ...log(), sets: [{ ...log().sets[0], setIndex: 3 }] },
          client,
        )
      ).data.error.code,
    ).toBe("SET_SCOPE");
    expect(
      (
        await call(
          path,
          "PUT",
          { ...log(), sets: [...log().sets, ...log().sets] },
          client,
        )
      ).data.error.code,
    ).toBe("SET_DUPLICATE");
    expect(
      (await call(path, "PUT", { ...log(), performedOn: "2099-01-01" }, client))
        .data.error.code,
    ).toBe("PERFORMED_DATE");
  });
  it("persists actual results and rejects stale concurrent journal edits", async () => {
    const path = `/program-assignments/${assignmentId}/days/${dayId}/log`;
    const rs = await Promise.all([
      call(path, "PUT", log(), client),
      call(path, "PUT", { ...log(), comment: "Из другой вкладки" }, client),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const before = (await call("/program-assignments/" + assignmentId)).data;
    expect(before.logs[0].sets[0].actualReps).toBe(11);
    const r = await call(
      path,
      "PUT",
      {
        ...log(1),
        completed: true,
        sets: [
          ...log().sets,
          { ...log().sets[0], setIndex: 2, actualReps: 12 },
        ],
      },
      client,
    );
    expect(r.status).toBe(200);
    const after = (
      await call(
        "/program-assignments/" + assignmentId,
        "GET",
        undefined,
        client,
      )
    ).data;
    expect(after.logs[0].revisions).toHaveLength(2);
    expect(after.logs[0].completedAt).toBeTruthy();
    expect(after.status).toBe("ACTIVE");
  });
  it("replaces explicitly and preserves the previous journal and archived snapshots", async () => {
    const old = (await call("/program-assignments/" + assignmentId)).data,
      p = (await call("/programs/" + programId)).data,
      d = draft();
    d.title = "Новый этап";
    await call("/programs/" + programId, "PUT", {
      version: p.version,
      draft: d,
    });
    const edited = (await call("/programs/" + programId)).data,
      published = await call("/programs/" + programId + "/publish", "POST", {
        version: edited.version,
      });
    const replacement = await call(
      "/program-assignments/" + assignmentId + "/replace",
      "POST",
      {
        version: old.version,
        programVersionId: published.data.id,
        startsOn: today(),
        reason: "Обновление нагрузки",
      },
    );
    expect(replacement.status).toBe(201);
    const history = (
      await call(
        "/program-assignments/" + assignmentId,
        "GET",
        undefined,
        client,
      )
    ).data;
    expect(history.status).toBe("REPLACED");
    expect(history.replacedById).toBe(replacement.data.id);
    expect(history.logs[0].revisions).toHaveLength(2);
    expect(history.programVersion.title).toBe("Основы движения");
    expect(
      (
        await call(
          `/program-assignments/${assignmentId}/days/${dayId}/log`,
          "PUT",
          log(2),
          client,
        )
      ).data.error.code,
    ).toBe("ASSIGNMENT_FINISHED");
    assignmentId = replacement.data.id;
    const ex = await db.exercise.findUnique({ where: { id: exerciseId } });
    await call(
      "/exercises/" + exerciseId + "/archive",
      "POST",
      { version: ex.version, archived: true, reason: "Обновление каталога" },
      owner,
    );
    expect(
      (
        await call(
          "/program-assignments/" + assignmentId,
          "GET",
          undefined,
          client,
        )
      ).data.programVersion.days[0].exercises[0].exerciseSnapshot.name,
    ).toBe("Приседание с гантелью");
    expect(
      (
        await call("/programs/" + programId + "/publish", "POST", {
          version: edited.version + 1,
        })
      ).data.error.code,
    ).toBe("EXERCISE_ARCHIVED");
  });
  it("completes the assignment only after all prescribed days", async () => {
    const a = (
      await call(
        "/program-assignments/" + assignmentId,
        "GET",
        undefined,
        client,
      )
    ).data;
    for (const day of a.programVersion.days) {
      const sets = day.exercises.flatMap(
        (e: {
          id: string;
          sets: number;
          reps: number | null;
          durationSeconds: number | null;
        }) =>
          Array.from({ length: e.sets }, (_, i) => ({
            programExerciseId: e.id,
            setIndex: i + 1,
            actualReps: e.reps,
            actualSeconds: e.durationSeconds,
            actualWeightKg: null,
          })),
      );
      expect(
        (
          await call(
            `/program-assignments/${assignmentId}/days/${day.id}/log`,
            "PUT",
            {
              version: 0,
              performedOn: today(),
              completed: true,
              comment: "Готово",
              sets,
            },
            client,
          )
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await call(
          "/program-assignments/" + assignmentId,
          "GET",
          undefined,
          client,
        )
      ).data.status,
    ).toBe("COMPLETED");
  });
});
