import { Prisma } from "../generated/prisma/client";
import { Db } from "../db";
import { fail } from "./business-error";
export type Tx = Prisma.TransactionClient;
export async function atomic<T>(
  db: Db,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2034" && attempt < 3) continue;
        if (e.code === "P2002")
          fail("DUPLICATE", "Запись с такими данными уже существует", 409);
        if (e.code === "P2025") fail("NOT_FOUND", "Запись не найдена", 404);
      }
      throw e;
    }
  }
  return fail("CONFLICT", "Данные изменились. Повторите действие", 409);
}
export function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  changes: Prisma.InputJsonValue = {},
  reason?: string,
) {
  return tx.auditLog.create({
    data: { actorId, action, entityType, entityId, changes, reason },
  });
}
export function changed(count: number) {
  if (count !== 1)
    fail(
      "VERSION_CONFLICT",
      "Запись изменена другим сотрудником. Обновите данные",
      409,
    );
}
