import { createHash } from "node:crypto";
import { Db } from "../db";
import { Prisma } from "../generated/prisma/client";
import { atomic, type Tx } from "./transaction";
import { fail } from "./business-error";
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export async function idempotent<T>(
  db: Db,
  actorId: string,
  route: string,
  key: string | undefined,
  body: unknown,
  operation: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!key || key.length < 8 || key.length > 128)
    fail(
      "IDEMPOTENCY_REQUIRED",
      "Повторите действие с новым идентификатором запроса",
      400,
    );
  const requestHash = createHash("sha256")
    .update(JSON.stringify(stable(body)))
    .digest("hex");
  return atomic(db, async (tx) => {
    const lock = actorId + ":" + route + ":" + key;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`;
    const old = await tx.idempotencyRecord.findUnique({
      where: { actorId_route_key: { actorId, route, key } },
    });
    if (old) {
      if (old.requestHash !== requestHash)
        fail(
          "IDEMPOTENCY_CONFLICT",
          "Этот запрос уже использован с другими параметрами",
          409,
        );
      return old.response as T;
    }
    const result = await operation(tx);
    await tx.idempotencyRecord.create({
      data: {
        actorId,
        route,
        key,
        requestHash,
        response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      },
    });
    return result;
  });
}
