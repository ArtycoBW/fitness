import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../db";
import { parse, uuid } from "../../common/validation";
import { atomic, audit } from "../../common/transaction";
import { fail } from "../../common/business-error";
import type { Principal } from "../auth/access";
import { midnight, DAY } from "../memberships/membership.schema";

const period = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    trainerId: uuid.optional(),
  })
  .refine(
    (q) => q.to >= q.from && Date.parse(q.to) - Date.parse(q.from) < 92 * DAY,
    { message: "Выберите период до 92 дней" },
  );
const entry = z.strictObject({
  minutes: z.number().int().min(0).max(1440),
  note: z.string().trim().max(500).default(""),
  version: z.number().int().min(0),
});
const statuses = ["PUBLISHED", "IN_PROGRESS", "COMPLETED"];
function admin(auth: Principal) {
  if (!auth.roles.some((r) => ["OWNER", "ADMIN"].includes(r)))
    fail("FORBIDDEN", "Учёт часов доступен администратору", 403);
}

@Injectable()
export class TrainerHoursService {
  constructor(private readonly db: Db) {}

  async report(auth: Principal, query: unknown) {
    admin(auth);
    const q = parse(period, query);
    const from = midnight(q.from),
      to = new Date(midnight(q.to).getTime() + DAY);
    const now = new Date();
    return this.db.$transaction(
      async (tx) => {
        const trainers = await tx.trainerProfile.findMany({
          where: q.trainerId ? { id: q.trainerId } : {},
          select: { id: true, user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        });
        const sessions = await tx.scheduledSession.findMany({
          where: {
            trainerId: q.trainerId,
            status: { in: statuses },
            startAt: { gte: from, lt: to },
          },
          include: {
            workLog: true,
            trainer: { select: { user: { select: { name: true } } } },
            workout: { select: { name: true } },
            hall: { select: { name: true } },
            _count: {
              select: {
                bookings: {
                  where: {
                    status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] },
                  },
                },
              },
            },
          },
          orderBy: [{ startAt: "desc" }, { id: "asc" }],
        });
        const totals = trainers.map((t) => ({
          id: t.id,
          name: t.user.name,
          scheduledMinutes: 0,
          workedMinutes: 0,
          sessions: 0,
          pending: 0,
        }));
        const byTrainer = new Map(totals.map((t) => [t.id, t]));
        const days = [];
        for (let d = from.getTime(); d < to.getTime(); d += DAY)
          days.push({
            date: new Date(d + 10800000).toISOString().slice(0, 10),
            booked: 0,
            capacity: 0,
            sessions: 0,
          });
        const byDay = new Map(days.map((d) => [d.date, d]));
        const items = sessions.map((s) => {
          const minutes = Math.round(
            (s.endAt.getTime() - s.startAt.getTime()) / 60000,
          );
          const ended = s.endAt <= now;
          const t = byTrainer.get(s.trainerId)!;
          t.sessions++;
          t.scheduledMinutes += minutes;
          if (ended) {
            t.workedMinutes += s.workLog?.minutes ?? 0;
            if (!s.workLog) t.pending++;
          }
          const d = byDay.get(
            new Date(s.startAt.getTime() + 10800000).toISOString().slice(0, 10),
          )!;
          d.sessions++;
          d.capacity += s.capacity;
          d.booked += s._count.bookings;
          return {
            id: s.id,
            trainerId: s.trainerId,
            trainer: s.trainer.user.name,
            workout: s.workout.name,
            hall: s.hall.name,
            startAt: s.startAt,
            endAt: s.endAt,
            plannedMinutes: minutes,
            ended,
            workLog: s.workLog
              ? {
                  minutes: s.workLog.minutes,
                  note: s.workLog.note,
                  version: s.workLog.version,
                }
              : null,
          };
        });
        const capacity = days.reduce((n, d) => n + d.capacity, 0),
          booked = days.reduce((n, d) => n + d.booked, 0);
        return {
          trainers: totals,
          days,
          items,
          summary: {
            sessions: items.length,
            workedMinutes: totals.reduce((n, t) => n + t.workedMinutes, 0),
            pending: totals.reduce((n, t) => n + t.pending, 0),
            occupancy: capacity ? Math.round((booked / capacity) * 100) : null,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  async record(auth: Principal, id: string, body: unknown) {
    admin(auth);
    parse(uuid, id);
    const dto = parse(entry, body);
    return atomic(this.db, async (tx) => {
      const session = await tx.scheduledSession.findUnique({
        where: { id },
        include: { workLog: true },
      });
      if (!session) fail("NOT_FOUND", "Занятие не найдено", 404);
      if (!statuses.includes(session.status) || session.endAt > new Date())
        fail(
          "SESSION_NOT_FINISHED",
          "Можно учитывать только прошедшие, не отменённые занятия",
          422,
        );
      if ((session.workLog?.version ?? 0) !== dto.version)
        fail("VERSION_CONFLICT", "Часы уже изменены. Обновите данные", 409);
      const planned = Math.round(
        (session.endAt.getTime() - session.startAt.getTime()) / 60000,
      );
      if (dto.minutes !== planned && dto.note.length < 3)
        fail("REASON_REQUIRED", "Укажите причину изменения длительности", 422);
      const data = {
        minutes: dto.minutes,
        note: dto.note,
        recordedBy: auth.id,
      };
      const result = await tx.trainerWorkLog.upsert({
        where: { sessionId: id },
        create: { sessionId: id, ...data },
        update: { ...data, version: { increment: 1 } },
      });
      await audit(
        tx,
        auth.id,
        "TRAINER_HOURS_RECORDED",
        "Session",
        id,
        {
          trainerId: session.trainerId,
          previousMinutes: session.workLog?.minutes ?? null,
          minutes: dto.minutes,
        },
        dto.note || undefined,
      );
      return result;
    });
  }
}
