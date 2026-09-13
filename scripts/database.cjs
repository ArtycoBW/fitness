// PostgreSQL 18 client tools must be on PATH, or in PG_BIN.
const { spawnSync } = require("node:child_process");
const { resolve, join } = require("node:path");
const {
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} = require("node:fs");
const { createHash } = require("node:crypto");
const { Pool } = require("../apps/api/node_modules/pg");
require("dotenv").config({ quiet: true });
function run(binary, args, url) {
  const executable = process.env.PG_BIN
    ? join(
        process.env.PG_BIN,
        binary + (process.platform === "win32" ? ".exe" : ""),
      )
    : binary;
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      binary + " failed; check PostgreSQL client installation and connection",
    );
}
async function main() {
  const [mode, argument] = process.argv.slice(2);
  if (!["backup", "restore"].includes(mode) || !argument)
    throw new Error(
      "Usage: node scripts/database.cjs backup|restore path.dump",
    );
  const file = resolve(argument);
  const source = new URL(process.env.DATABASE_URL);
  if (mode === "backup") {
    if (
      existsSync(file) ||
      existsSync(file + ".partial") ||
      existsSync(file + ".sha256")
    )
      throw new Error(
        "Backup destination already exists; choose a new filename",
      );
    mkdirSync(require("node:path").dirname(file), { recursive: true });
    run(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        file + ".partial",
      ],
      source,
    );
    renameSync(file + ".partial", file);
    writeFileSync(
      file + ".sha256",
      createHash("sha256").update(readFileSync(file)).digest("hex") + "\n",
      { flag: "wx" },
    );
    console.log("Backup and SHA-256 created: " + file);
    return;
  }
  if (!process.env.RESTORE_DATABASE_URL)
    throw new Error("Set RESTORE_DATABASE_URL to a NEW database");
  const target = new URL(process.env.RESTORE_DATABASE_URL);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (
    !/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(name) ||
    ["postgres", "template0", "template1"].includes(name)
  )
    throw new Error("Unsafe restore database name");
  if (target.host === source.host && target.pathname === source.pathname)
    throw new Error("Restore must not target the source database");
  const expected = readFileSync(file + ".sha256", "utf8").trim();
  if (
    createHash("sha256").update(readFileSync(file)).digest("hex") !== expected
  )
    throw new Error("Backup checksum mismatch");
  const admin = new URL(target);
  admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.href });
  try {
    if (
      (await pool.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
        .rowCount
    )
      throw new Error(
        "Restore database already exists; existing data is never replaced",
      );
    await pool.query('CREATE DATABASE "' + name + '"');
  } finally {
    await pool.end();
  }
  run(
    "pg_restore",
    [
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-acl",
      "--dbname",
      name,
      file,
    ],
    target,
  );
  console.log("Restored into new database: " + name);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
