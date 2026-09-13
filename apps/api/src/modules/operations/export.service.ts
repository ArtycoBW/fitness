import { Injectable } from "@nestjs/common";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Db } from "../../db";
import { env } from "../../config";
import { parse, uuid } from "../../common/validation";
import { fail } from "../../common/business-error";
import { idempotent } from "../../common/idempotency";
import type { Principal } from "../auth/access";
import { ReportService, type Report } from "./report.service";
export const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  let first = 0;
  while (
    first < s.length &&
    (s.charCodeAt(first) <= 32 || /\s/.test(s[first]!))
  )
    first++;
  if (typeof v !== "number" && ["=", "+", "@", "-"].includes(s[first] ?? ""))
    s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
export const reportCsv = (r: Report) =>
  "\uFEFF" +
  [
    r.columns.map((c) => csvCell(c.label)).join(";"),
    ...r.items.map((row) =>
      r.columns.map((c) => csvCell(row[c.key])).join(";"),
    ),
  ].join("\r\n");
@Injectable()
export class ExportService {
  constructor(
    private readonly db: Db,
    private readonly reports: ReportService,
  ) {}
  async create(auth: Principal, body: unknown, key?: string) {
    const { q } = this.reports.filters(auth, body);
    return idempotent(this.db, auth.id, "export-create", key, q, async (tx) => {
      if (
        (await tx.exportJob.count({
          where: {
            requestedBy: auth.id,
            status: { in: ["PENDING", "PROCESSING"] },
          },
        })) >= 3
      )
        fail("EXPORT_BUSY", "Дождитесь завершения текущих выгрузок");
      return tx.exportJob.create({
        data: { requestedBy: auth.id, filters: q },
      });
    });
  }
  async list(auth: Principal) {
    return this.db.exportJob.findMany({
      where: { requestedBy: auth.id },
      select: {
        id: true,
        status: true,
        filters: true,
        rowCount: true,
        createdAt: true,
        expiresAt: true,
        lastError: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
  async download(auth: Principal, id: string) {
    parse(uuid, id);
    const job = await this.db.exportJob.findUnique({ where: { id } });
    if (!job || job.requestedBy !== auth.id)
      fail("NOT_FOUND", "Выгрузка не найдена", 404);
    this.reports.filters(auth, job.filters);
    if (
      job.status !== "READY" ||
      !job.fileName ||
      !job.expiresAt ||
      job.expiresAt <= new Date()
    )
      fail("EXPORT_UNAVAILABLE", "Выгрузка недоступна. Сформируйте её заново");
    if (job.fileName !== id + ".csv") fail("EXPORT_FILE", "Файл недоступен");
    return readFile(join(resolve(env.UPLOADS_DIR), "exports", job.fileName));
  }
  async tick() {
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`UPDATE "ExportJob" SET status='PROCESSING',"lockedAt"=NOW() WHERE id IN(SELECT id FROM "ExportJob" WHERE status='PENDING' OR (status='PROCESSING' AND "lockedAt"<NOW()-INTERVAL '5 minutes') ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 2) RETURNING id`;
    for (const row of rows) {
      try {
        const job = await this.db.exportJob.findUniqueOrThrow({
            where: { id: row.id },
          }),
          u = await this.db.user.findUnique({
            where: { id: job.requestedBy },
            include: { roles: true, trainer: true, client: true },
          });
        if (!u || u.status !== "ACTIVE") throw Error("Access revoked");
        const auth: Principal = {
          id: u.id,
          name: u.name,
          email: u.email,
          verified: !!u.emailVerifiedAt,
          roles: u.roles.map((r) => r.role),
          clientId: u.client?.id ?? null,
          trainerId: u.trainer?.id ?? null,
          sessionId: "worker",
        };
        const report = await this.reports.exported(auth, job.filters),
          dir = join(resolve(env.UPLOADS_DIR), "exports"),
          fileName = job.id + ".csv";
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, fileName), reportCsv(report), "utf8");
        await this.db.exportJob.update({
          where: { id: job.id },
          data: {
            status: "READY",
            fileName,
            rowCount: report.total,
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 3600000),
            lockedAt: null,
            lastError: null,
          },
        });
      } catch {
        await this.db.exportJob.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            lockedAt: null,
            lastError:
              "Не удалось сформировать отчёт. Проверьте доступ и сузьте период.",
          },
        });
      }
    }
    const expired = await this.db.exportJob.findMany({
      where: { status: "READY", expiresAt: { lte: new Date() } },
      take: 100,
    });
    for (const job of expired) {
      if (job.fileName === job.id + ".csv")
        await unlink(
          join(resolve(env.UPLOADS_DIR), "exports", job.fileName),
        ).catch(() => undefined);
      await this.db.exportJob.update({
        where: { id: job.id },
        data: { status: "EXPIRED", fileName: null },
      });
    }
  }
}
