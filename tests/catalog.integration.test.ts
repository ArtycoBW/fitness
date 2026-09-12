import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { Db } = require("../apps/api/dist/db");
const { digest, unseal } = require("../apps/api/dist/common/crypto");
const db = new Db();
let server: ChildProcess;
const base = "http://localhost:4100/api/v1",
  key = randomUUID();
let owner = "",
  reception = "",
  client = "",
  trainer = "",
  trainerId = "",
  clientId = "",
  hallId = "",
  version = 1;
async function identity(role: string) {
  const raw = randomUUID(),
    user = await db.user.create({
      data: {
        email: role + "-" + key + "@example.com",
        name: "Проверка " + role,
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: { role } },
        ...(role === "TRAINER"
          ? { trainer: { create: { slug: "qa-" + key } } }
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
  return { cookie: "fitness_session=" + raw, trainerId: user.trainer?.id };
}
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = owner,
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": "csrf",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}
beforeAll(async () => {
  owner = (await identity("OWNER")).cookie;
  reception = (await identity("RECEPTION")).cookie;
  client = (await identity("CLIENT")).cookie;
  const t = await identity("TRAINER");
  trainer = t.cookie;
  trainerId = t.trainerId;
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
describe.sequential("Club catalog permissions and persistence", () => {
  it("sanitizes an avatar and rejects unsupported files and cross-user writes", async () => {
    const own = (await call("/auth/me", "GET", undefined, client)).data;
    const form = new FormData();
    form.append(
      "file",
      new Blob(
        [
          new Uint8Array(
            require("node:fs").readFileSync(
              "apps/web/public/media/stride/sprinters.webp",
            ),
          ),
        ],
        { type: "image/webp" },
      ),
      "photo.webp",
    );
    const headers = {
      Origin: "http://localhost:3000",
      Cookie: client,
      "X-CSRF-Token": "csrf",
    };
    const res = await fetch(base + "/media/users/" + own.id, {
      method: "POST",
      headers,
      body: form,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(
      (await fetch("http://localhost:4100" + body.url)).headers.get(
        "content-type",
      ),
    ).toContain("image/webp");
    const bad = new FormData();
    bad.append(
      "file",
      new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
      "bad.svg",
    );
    expect(
      (
        await fetch(base + "/media/users/" + own.id, {
          method: "POST",
          headers,
          body: bad,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + "/media/users/" + randomUUID(), {
          method: "POST",
          headers,
          body: form,
        })
      ).status,
    ).toBe(403);
  });
  it("protects CRM from clients and trainers", async () => {
    expect(
      (await call("/catalog/clients", "GET", undefined, client)).status,
    ).toBe(403);
    expect(
      (await call("/catalog/clients", "GET", undefined, trainer)).status,
    ).toBe(403);
  });
  it("allows reception to create a client and add a private note", async () => {
    const result = await call(
      "/catalog/clients",
      "POST",
      { name: "Клиент " + key, phone: "+7 (999) 123-45-67" },
      reception,
    );
    expect(result.status).toBe(201);
    clientId = result.data.id;
    expect(result.data.phone).toBe("+79991234567");
    expect(
      (
        await call(
          "/catalog/clients/" + clientId + "/notes",
          "POST",
          { text: "Служебная заметка" },
          reception,
        )
      ).status,
    ).toBe(201);
  });
  it("assigns a client to one trainer and scopes their list", async () => {
    expect(
      (await call("/trainer/clients", "GET", undefined, trainer)).data,
    ).toEqual([]);
    expect(
      (
        await call("/catalog/clients/" + clientId + "/trainers", "POST", {
          trainerId,
          assigned: true,
        })
      ).status,
    ).toBe(201);
    const own = await call("/trainer/clients", "GET", undefined, trainer);
    expect(own.data.map((c: { id: string }) => c.id)).toContain(clientId);
    expect(JSON.stringify(own.data)).not.toContain("Служебная заметка");
  });
  it("restricts hall creation to administrators", async () => {
    expect(
      (
        await call(
          "/catalog/halls",
          "POST",
          { name: "Зал", slug: "qa-" + key, capacity: 8 },
          reception,
        )
      ).status,
    ).toBe(403);
    const r = await call("/catalog/halls", "POST", {
      name: "Зал",
      slug: "qa-" + key,
      capacity: 8,
      published: true,
    });
    expect(r.status).toBe(201);
    hallId = r.data.id;
  });
  it("detects stale edits without silently overwriting", async () => {
    const data = {
      name: "Обновлённый зал",
      slug: "qa-" + key,
      capacity: 10,
      published: true,
    };
    expect(
      (await call("/catalog/halls/" + hallId, "PATCH", { version, data }))
        .status,
    ).toBe(200);
    expect(
      (
        await call("/catalog/halls/" + hallId, "PATCH", {
          version,
          data: { ...data, name: "Потерянное изменение" },
        })
      ).status,
    ).toBe(409);
    version++;
    expect((await call("/catalog/halls/" + hallId)).data.name).toBe(data.name);
  });
  it("validates intervals and pagination", async () => {
    expect(
      (
        await call("/catalog/halls/" + hallId + "/closures", "POST", {
          startAt: "2026-12-10T12:00:00Z",
          endAt: "2026-12-10T11:00:00Z",
          reason: "Ремонт",
        })
      ).status,
    ).toBe(400);
    expect((await call("/catalog/clients?limit=100000")).status).toBe(400);
  });
  it("archives without deleting and excludes from public view", async () => {
    expect(
      (
        await call("/catalog/halls/" + hallId + "/archive", "POST", {
          version,
          archived: true,
          reason: "Реконструкция",
        })
      ).status,
    ).toBe(201);
    expect(
      (await call("/catalog/halls/" + hallId)).data.archivedAt,
    ).toBeTruthy();
    expect((await call("/public/halls/qa-" + key)).data).toEqual([]);
  });
  it("links the existing client only after invitation acceptance", async () => {
    const email = "claim-" + key + "@example.com";
    expect(
      (
        await call("/catalog/clients/" + clientId + "/invitation", "POST", {
          email,
        })
      ).status,
    ).toBe(201);
    const event = await db.outboxEvent.findFirst({
      where: { dedupKey: { startsWith: "client-invite:" } },
      orderBy: { createdAt: "desc" },
    });
    const token = /token=([a-f0-9]{64})/.exec(unseal(event.payload).text)![1];
    expect(
      (
        await call(
          "/auth/accept-invite",
          "POST",
          { token, password: "InvitationPassword2026!" },
          "",
        )
      ).status,
    ).toBe(201);
    expect(
      (await db.clientProfile.findUnique({ where: { id: clientId } })).userId,
    ).toBeTruthy();
    expect(
      (
        await call(
          "/auth/accept-invite",
          "POST",
          { token, password: "InvitationPassword2026!" },
          "",
        )
      ).status,
    ).toBe(422);
  });
});
