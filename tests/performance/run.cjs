const { setTimeout: delay } = require("node:timers/promises");
const { performance } = require("node:perf_hooks");
const { readFileSync, writeFileSync } = require("node:fs");
(async () => {
  const base = process.env.LOAD_API_URL || "http://localhost:4101/api/v1";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Benchmark only runs against localhost");
  const password = process.env.E2E_PASSWORD;
  if (!password)
    throw new Error("Set E2E_PASSWORD for the restored seed owner");
  const auth = await fetch(base + "/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ email: "owner@stride.local", password }),
  });
  if (!auth.ok) throw new Error("Load login failed: " + auth.status);
  const cookies = auth.headers.getSetCookie().map((c) => c.split(";")[0]);
  const csrf = decodeURIComponent(
    cookies
      .find((c) => c.startsWith("fitness_csrf="))
      .slice("fitness_csrf=".length),
  );
  const cookie = cookies.join("; ");
  const fixture = JSON.parse(
    readFileSync(
      process.env.LOAD_FIXTURE_OUTPUT || ".local/load-fixture.json",
      "utf8",
    ),
  );
  const seconds = Number(process.env.LOAD_SECONDS || 300),
    rate = Number(process.env.LOAD_RATE || 30);
  if (!(seconds > 0 && seconds <= 900 && rate > 0 && rate <= 100))
    throw new Error("Bounded load: 1–900 seconds, 1–100 requests/sec");
  const day = new Date().toISOString().slice(0, 10),
    to = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  const routes = [
    "/catalog/clients?page=1",
    "/catalog/clients?page=400",
    "/payments?page=1&area=admin",
    "/payments?page=200&area=admin",
    "/bookings?page=1&area=admin&upcoming=false",
    "/public/schedule?from=" + day + "&to=" + to,
    "/catalog/clients/" + fixture.noteClientId,
    "/public/membership-plans",
    "/catalog/clients?q=Нагрузочный",
  ];
  const results = [],
    pending = new Set();
  const start = performance.now();
  let late = 0;
  async function request(i) {
    const write = i % 10 === 9,
      path = write
        ? "/catalog/clients/" + fixture.noteClientId + "/notes"
        : routes[i % 10];
    const begin = performance.now();
    let status = 0;
    try {
      const r = await fetch(base + path, {
        method: write ? "POST" : "GET",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:3000",
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
        },
        ...(write
          ? { body: JSON.stringify({ text: "Нагрузочная проверка " + i }) }
          : {}),
        signal: AbortSignal.timeout(15000),
      });
      await r.arrayBuffer();
      status = r.status;
    } catch {
      /* Count errors in the report. */
    }
    results.push({ write, status, ms: performance.now() - begin });
  }
  for (let i = 0; i < seconds * rate; i++) {
    const due = start + (i * 1000) / rate,
      wait = due - performance.now();
    if (wait > 0) await delay(wait);
    else if (wait < -100) late++;
    const p = request(i);
    pending.add(p);
    p.finally(() => pending.delete(p));
  }
  await Promise.all(pending);
  const metrics = (items) => {
    const times = items.map((r) => r.ms).sort((a, b) => a - b);
    return {
      requests: items.length,
      errors: items.filter((r) => r.status < 200 || r.status >= 300).length,
      p50: Math.round(times[Math.floor(times.length * 0.5)] || 0),
      p95: Math.round(times[Math.floor(times.length * 0.95)] || 0),
      p99: Math.round(times[Math.floor(times.length * 0.99)] || 0),
      max: Math.round(times.at(-1) || 0),
    };
  };
  const report = {
    dataset: fixture.counts,
    seconds,
    rate,
    elapsedSeconds: (performance.now() - start) / 1000,
    lateStarts: late,
    read: metrics(results.filter((r) => !r.write)),
    write: metrics(results.filter((r) => r.write)),
    statuses: results.reduce(
      (a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }),
      {},
    ),
    hardware: {
      platform: process.platform,
      cpus: require("node:os").cpus().length,
      cpu: require("node:os").cpus()[0].model,
      memoryGB: Math.round(require("node:os").totalmem() / 1024 ** 3),
    },
  };
  writeFileSync(
    process.env.LOAD_REPORT || ".local/load-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    report.read.errors ||
    report.write.errors ||
    report.read.p95 > 500 ||
    report.write.p95 > 800
  )
    process.exitCode = 1;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
