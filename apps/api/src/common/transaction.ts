import { Prisma } from "../generated/prisma/client";
import { Db } from "../db";
import { fail } from "./business-error";
import { requestId } from "./request-context";
export type Tx = Prisma.TransactionClient;
export async function atomic<T>(
  db: Db,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        const adapter = e.meta?.driverAdapterError as
          { cause?: { kind?: string; originalCode?: string } } | undefined;
        const retryable =
          e.code === "P2034" ||
          (e.code === "P2010" &&
            adapter?.cause?.kind === "TransactionWriteConflict");
        if (retryable) {
          if (attempt < 7) {
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Math.min(250, 15 * 2 ** attempt) +
                  Math.floor(Math.random() * 40),
              ),
            );
            continue;
          }
          fail(
            "CONCURRENT_MODIFICATION",
            "Данные изменяются другим запросом. Повторите действие",
            409,
          );
        }
        if (adapter?.cause?.originalCode === "23P01")
          fail(
            "RESOURCE_CONFLICT",
            "Выбранное время пересекается с другой записью",
            409,
          );
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
    data: {
      actorId,
      action,
      entityType,
      entityId,
      changes,
      reason,
      requestId: requestId(),
    },
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
