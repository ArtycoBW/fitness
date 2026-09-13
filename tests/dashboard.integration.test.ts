import { beforeAll, afterAll, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Db } = require("../apps/api/dist/db"),
  { digest } = require("../apps/api/dist/common/crypto"),
  db = new Db(),
  key = randomUUID(),
  base = "http://localhost:4100/api/v1";
let server: ChildProcess,
  owner = "",
  multi = "",
  client = "",
  reception = "",
  trainerId = "",
  clientId = "",
  ownerId = "",
  otherId = "";
async function fixture(roles: string[], name: string) {
  const raw = randomUUID(),
    u = await db.user.create({
      data: {
        name,
        email: name + "-" + key + "@example.com",
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
        roles: { create: roles.map((role) => ({ role })) },
        ...(roles.includes("CLIENT")
          ? { client: { create: { name, phone: "+79991234567" } } }
          : {}),
        ...(roles.includes("TRAINER")
          ? { trainer: { create: { slug: name + "-" + key } } }
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
  cookie = multi,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      Cookie: cookie,
      "X-CSRF-Token": "csrf",
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
beforeAll(async () => {
  const o = await fixture(["OWNER"], "dash-owner");
  owner = o.cookie;
  ownerId = o.u.id;
  const m = await fixture(["ADMIN", "TRAINER", "CLIENT"], "dash-multi");
  multi = m.cookie;
  trainerId = m.u.trainer.id;
  clientId = m.u.client.id;
  const c = await fixture(["CLIENT"], "dash-client");
  client = c.cookie;
  otherId = c.u.client.id;
  reception = (await fixture(["RECEPTION"], "dash-reception")).cookie;
  await db.trainerClient.create({ data: { trainerId, clientId: otherId } });
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
it("authorizes areas and separates multi-role client and trainer summaries", async () => {
  expect((await call("/dashboard?area=admin", client)).status).toBe(403);
  expect((await call("/dashboard?area=trainer", client)).status).toBe(403);
  const mine = (await call("/dashboard?area=account")).data;
  expect(mine.area).toBe("account");
  expect(mine.bookings).toEqual([]);
  expect(mine.attended).toBe(0);
  const coach = (await call("/dashboard?area=trainer")).data;
  expect(coach.clients).toBe(1);
  expect((await call("/dashboard?area=admin", reception)).status).toBe(200);
});
it("scopes all personal list endpoints even for an administrator client", async () => {
  for (const path of [
    "/memberships",
    "/payments",
    "/bookings",
    "/program-assignments",
  ]) {
    expect((await call(path + "?area=account")).data.items).toEqual([]);
    expect((await call(path + "?area=admin", client)).status).toBe(403);
  }
});
it("exposes only assigned client training data and excludes private CRM notes", async () => {
  const result = await call("/trainer/clients/" + otherId);
  expect(result.status).toBe(200);
  expect(result.data.id).toBe(otherId);
  expect(result.data).not.toHaveProperty("notes");
  expect(result.data).not.toHaveProperty("phone");
  expect((await call("/trainer/clients/" + clientId)).status).toBe(404);
  expect((await call("/trainer/clients/" + otherId, client)).status).toBe(403);
});
it("keeps user administration and invitation tokens private", async () => {
  expect((await call("/users", reception)).status).toBe(403);
  expect((await call("/users", client)).status).toBe(403);
  const list = (await call("/users?q=" + key, owner)).data;
  expect(list.total).toBe(4);
  expect(list.items[0]).not.toHaveProperty("passwordHash");
  await call("/staff/invitations", owner, "POST", {
    name: "Новый сотрудник",
    email: "invite-" + key + "@example.com",
    roles: ["RECEPTION"],
  });
  const invites = (await call("/staff/invitations", owner)).data;
  expect(
    invites.some(
      (i: { email: string }) => i.email === "invite-" + key + "@example.com",
    ),
  ).toBe(true);
  expect(invites[0]).not.toHaveProperty("tokenHash");
  expect(
    (
      await call("/users/" + ownerId + "/roles", owner, "PUT", {
        roles: ["CLIENT"],
      })
    ).status,
  ).toBe(422);
});
it("returns active-session marker and persistent CRM filters", async () => {
  const sessions = (await call("/auth/sessions", client)).data;
  expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(
    1,
  );
  const linked = (await call("/catalog/clients?trainerId=" + trainerId, owner))
    .data;
  expect(linked.items.map((c: { id: string }) => c.id)).toEqual([otherId]);
  const inactive = (
    await call(
      "/catalog/clients?q=" + key + "&membership=none&lastVisit=inactive",
      owner,
    )
  ).data;
  expect(inactive.total).toBe(2);
});
