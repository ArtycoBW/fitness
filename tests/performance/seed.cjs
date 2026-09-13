const { Pool } = require("../../apps/api/node_modules/pg");
const { createHash } = require("node:crypto");
const { writeFileSync } = require("node:fs");
require("dotenv").config({ quiet: true });
(async () => {
  const source = new Pool({ connectionString: process.env.DATABASE_URL });
  const targetUrl = new URL(process.env.LOAD_DATABASE_URL);
  if (!targetUrl.pathname.endsWith("_load_test"))
    throw new Error("LOAD_DATABASE_URL must end in _load_test");
  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.href });
  const name = targetUrl.pathname.slice(1);
  if (!/^[a-z][a-z0-9_]+$/.test(name)) throw new Error("Unsafe name");
  if (
    (await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
      .rowCount
  )
    throw new Error("Load database already exists");
  const restoreName = process.env.LOAD_TEMPLATE_DATABASE;
  if (!restoreName || !/^[a-z][a-z0-9_]+$/.test(restoreName))
    throw new Error("Set LOAD_TEMPLATE_DATABASE to a restored seed database");
  await admin.query(
    'CREATE DATABASE "' + name + '" TEMPLATE "' + restoreName + '"',
  );
  await admin.end();
  await source.end();
  const pool = new Pool({ connectionString: targetUrl.href });
  const db = await pool.connect();
  const uid = (kind, n) => {
    const h = createHash("md5")
      .update("load:" + kind + ":" + n)
      .digest("hex");
    return (
      h.slice(0, 8) +
      "-" +
      h.slice(8, 12) +
      "-" +
      h.slice(12, 16) +
      "-" +
      h.slice(16, 20) +
      "-" +
      h.slice(20)
    );
  };
  try {
    await db.query("BEGIN");
    const insert = async (table, sql) =>
      db.query(
        'INSERT INTO "' +
          table +
          '" SELECT (jsonb_populate_record(NULL::"' +
          table +
          '", payload)).* FROM (' +
          sql +
          ") fixtures",
      );
    await insert(
      "ClientProfile",
      `SELECT jsonb_build_object('id',md5('load:client:'||n)::uuid,'userId',null,'name','Нагрузочный клиент '||n,'status','ACTIVE','visitsBlocked',false,'joinedAt',now(),'version',1) payload FROM generate_series(1,10000) n`,
    );
    const order = (
      await db.query(
        `SELECT to_jsonb(o) data FROM "Order" o JOIN "MembershipPlanVersion" v ON v.id=o."planVersionId" JOIN "PaymentAttempt" p ON p."orderId"=o.id WHERE o.status='PAID' AND p.status='SUCCEEDED' LIMIT 1`,
      )
    ).rows[0]?.data;
    if (!order)
      throw new Error("Template needs a completed membership purchase");
    await db.query("CREATE TEMP TABLE load_template(data jsonb)");
    await db.query("INSERT INTO load_template VALUES($1)", [order]);
    await insert(
      "Order",
      `SELECT data || jsonb_build_object('id',md5('load:order:'||n)::uuid,'clientId',md5('load:client:'||((n-1)%10000+1))::uuid,'createdAt',now()-((n%365)||' days')::interval,'paidAt',now()-((n%365)||' days')::interval) payload FROM load_template CROSS JOIN generate_series(1,50000) n`,
    );
    await insert(
      "PaymentAttempt",
      `SELECT jsonb_build_object('id',md5('load:payment:'||n)::uuid,'orderId',md5('load:order:'||n)::uuid,'method','CARD','provider','simulator','providerPaymentId','load-'||n,'status','SUCCEEDED','amountMinor',(data->>'totalMinor')::int,'maskedLast4','1111','confirmedAt',now()-((n%365)||' days')::interval,'createdAt',now()-((n%365)||' days')::interval,'nextCheckAt',now(),'checkCount',1,'internalOutcome','SUCCESS') payload FROM load_template CROSS JOIN generate_series(1,50000) n`,
    );
    const member = (
      await db.query(
        'SELECT to_jsonb(m) data FROM "Membership" m WHERE "orderId"=$1',
        [order.id],
      )
    ).rows[0].data;
    await db.query("UPDATE load_template SET data=$1", [member]);
    await insert(
      "Membership",
      `SELECT data || jsonb_build_object('id',md5('load:membership:'||n)::uuid,'clientId',md5('load:client:'||n)::uuid,'orderId',md5('load:order:'||n)::uuid,'available',0,'reserved',0,'consumed',0,'refundHold',false,'cancelledAt',null) payload FROM load_template CROSS JOIN generate_series(1,10000) n`,
    );
    const session = (
      await db.query(
        `SELECT to_jsonb(s) data FROM "ScheduledSession" s WHERE capacity>=2 LIMIT 1`,
      )
    ).rows[0].data;
    await db.query("UPDATE load_template SET data=$1", [session]);
    await insert(
      "ScheduledSession",
      `SELECT data || jsonb_build_object('id',md5('load:session:'||n)::uuid,'seriesId',null,'occurrenceDate',null,'status','COMPLETED','startAt',now()-((50001-n)*2||' hours')::interval,'endAt',now()-((50001-n)*2-1||' hours')::interval) payload FROM load_template CROSS JOIN generate_series(1,50000) n`,
    );
    await insert(
      "Booking",
      `SELECT jsonb_build_object('id',md5('load:booking:'||n)::uuid,'sessionId',md5('load:session:'||((n-1)/2+1))::uuid,'clientId',md5('load:client:'||((n-1)%10000+1))::uuid,'membershipId',md5('load:membership:'||((n-1)%10000+1))::uuid,'status','CANCELLED_ON_TIME','balanceState','NONE','version',1,'queuedAt',now(),'createdAt',now(),'updatedAt',now(),'reason','Историческая нагрузочная запись') payload FROM generate_series(1,100000) n`,
    );
    await db.query("COMMIT");
    await db.query("ANALYZE");
    const counts = {};
    for (const t of [
      "ClientProfile",
      "ScheduledSession",
      "Booking",
      "PaymentAttempt",
    ])
      counts[t] = (
        await db.query('SELECT count(*)::int n FROM "' + t + '"')
      ).rows[0].n;
    const output = { counts, noteClientId: uid("client", 1) };
    writeFileSync(
      process.env.LOAD_FIXTURE_OUTPUT || ".local/load-fixture.json",
      JSON.stringify(output, null, 2),
    );
    console.log(JSON.stringify(output));
  } finally {
    db.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
