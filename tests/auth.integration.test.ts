import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { Db } = require("../apps/api/dist/db.js");
const { unseal } = require("../apps/api/dist/common/crypto.js");
const db = new Db();
let server: ChildProcess;
const base = "http://localhost:4100/api/v1";
const email = "auth-" + randomUUID() + "@example.com";
const password = "StrongPassword-2026!";
let cookie = "",
  csrf = "",
  userId = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
  origin = "http://localhost:3000",
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(authenticated ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  return { res, data };
}
async function login(pwd = password) {
  const { res } = await call(
    "/auth/login",
    "POST",
    { email, password: pwd },
    false,
  );
  cookie = res.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  csrf = /fitness_csrf=([^;]+)/.exec(cookie)?.[1] ?? "";
  return res.status;
}
async function tokenFor(purpose: string) {
  const event = await db.outboxEvent.findFirst({
    where: { type: "EMAIL", payload: { not: "" } },
    orderBy: { createdAt: "desc" },
  });
  const text = unseal(event.payload).text;
  expect(text).toContain(purpose);
  return /token=([a-f0-9]{64})/.exec(text)![1];
}
beforeAll(async () => {
  await db.$connect();
  server = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, API_PORT: "4100" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health/ready")).ok) return;
    } catch {
      /* Wait for the child API to bind its port. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("API not ready");
}, 20000);
afterAll(async () => {
  server?.kill();
  await db.$disconnect();
});
describe.sequential("Authentication with PostgreSQL", () => {
  it("requires session and rejects foreign origins", async () => {
    expect((await call("/auth/me")).res.status).toBe(401);
    expect(
      (
        await call(
          "/auth/register",
          "POST",
          {},
          false,
          "https://elsewhere.example",
        )
      ).res.status,
    ).toBe(403);
  });
  it("registers a client and never returns credentials", async () => {
    const { res, data } = await call(
      "/auth/register",
      "POST",
      { email, password, name: "Анна Проверка", consent: true },
      false,
    );
    expect(res.status).toBe(201);
    expect(JSON.stringify(data)).not.toContain("passwordHash");
  });
  it("rejects duplicate email and malformed input", async () => {
    expect(
      (
        await call(
          "/auth/register",
          "POST",
          { email, password, name: "Анна", consent: true },
          false,
        )
      ).res.status,
    ).toBe(409);
    expect(
      (await call("/auth/login", "POST", { email, password: "short" }, false))
        .res.status,
    ).toBe(400);
  });
  it("verifies a token only once", async () => {
    const token = await tokenFor("/verify-email");
    expect(
      (await call("/auth/verify-email", "POST", { token }, false)).res.status,
    ).toBe(201);
    expect(
      (await call("/auth/verify-email", "POST", { token }, false)).res.status,
    ).toBe(422);
  });
  it("logs in with protected cookie and returns safe role info", async () => {
    expect(await login()).toBe(201);
    const { data } = await call("/auth/me");
    userId = data.id;
    expect(data.roles).toEqual(["CLIENT"]);
    expect(data.emailVerifiedAt).toBeTruthy();
    expect(data.passwordHash).toBeUndefined();
  });
  it("requires CSRF and checks staff role on server", async () => {
    const saved = csrf;
    csrf = "wrong";
    expect(
      (await call("/me", "PATCH", { name: "Другой профиль" })).res.status,
    ).toBe(403);
    csrf = saved;
    expect(
      (
        await call("/staff/invitations", "POST", {
          email: "no@example.com",
          name: "Нет доступа",
          roles: ["ADMIN"],
        })
      ).res.status,
    ).toBe(403);
  });
  it("updates own profile persistently", async () => {
    expect(
      (
        await call("/me", "PATCH", {
          name: "Анна Обновлённая",
          phone: "+79991234567",
        })
      ).res.status,
    ).toBe(200);
    expect((await db.user.findUnique({ where: { id: userId } })).name).toBe(
      "Анна Обновлённая",
    );
  });
  it("resets password once and invalidates old sessions", async () => {
    await call("/auth/forgot-password", "POST", { email }, false);
    const token = await tokenFor("/reset-password");
    expect(
      (
        await call(
          "/auth/reset-password",
          "POST",
          { token, password: password + "2" },
          false,
        )
      ).res.status,
    ).toBe(201);
    expect((await call("/auth/me")).res.status).toBe(401);
    expect(
      (await call("/auth/reset-password", "POST", { token, password }, false))
        .res.status,
    ).toBe(422);
    expect(await login(password + "2")).toBe(201);
  });
  it("revokes session on logout", async () => {
    expect((await call("/auth/logout", "POST", {})).res.status).toBe(201);
    expect((await call("/auth/me")).res.status).toBe(401);
  });
});
