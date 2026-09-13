const { setTimeout: delay } = require("node:timers/promises");
(async () => {
  const target = new URL(process.argv[2]);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(target, { signal: AbortSignal.timeout(2000) })).ok) {
        console.log("Ready: " + target.origin + target.pathname);
        return;
      }
    } catch {
      /* Process may still be starting. */
    }
    await delay(500);
  }
  throw new Error("Service did not become ready in 60 seconds");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
