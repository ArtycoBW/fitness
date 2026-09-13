const { spawnSync } = require("node:child_process");
const { Pool } = require("../apps/api/node_modules/pg");
require("dotenv").config({ quiet: true });
(async () => {
  const source = new URL(
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  );
  const name = process.env.TEST_DATABASE_URL
    ? source.pathname.slice(1)
    : source.pathname.slice(1) + "_test";
  if (!/^[a-zA-Z0-9_]+$/.test(name) || !name.endsWith("_test"))
    throw new Error(
      "Integration database must have a safe name ending in _test",
    );
  source.pathname = "/postgres";
  const pool = new Pool({ connectionString: source.href });
  const guard = await pool.connect();
  const locked = await guard.query(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    ["fitness-integration:" + name],
  );
  if (!locked.rows[0].locked)
    throw new Error("Integration tests are already running for this database");
  const exists = await pool.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!exists.rowCount) await pool.query('CREATE DATABASE "' + name + '"');
  source.pathname = "/" + name;
  const env = {
    ...process.env,
    DATABASE_URL: source.href,
    OUTBOX_SECRET: "integration-only-key-32-characters-minimum",
  };
  const run = (script, args) =>
    spawnSync(process.execPath, [script, ...args], { stdio: "inherit", env });
  let result = run(require.resolve("prisma/build/index.js"), [
    "migrate",
    "deploy",
  ]);
  if (result.status !== 0) process.exit(result.status || 1);
  result = run(
    require("node:path").join(
      require("node:path").dirname(require.resolve("vitest/package.json")),
      "vitest.mjs",
    ),
    ["run"],
  );
  guard.release();
  await pool.end();
  process.exit(result.status || 0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
