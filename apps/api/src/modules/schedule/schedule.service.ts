import { Injectable } from "@nestjs/common";
import { Db } from "../../db";
import { parse, uuid } from "../../common/validation";
import { atomic, audit, type Tx } from "../../common/transaction";
import { idempotent } from "../../common/idempotency";
import { fail } from "../../common/business-error";
import type { Principal } from "../auth/access";
import {
  sessionSchema,
  seriesSchema,
  editSchema,
  cancelSchema,
  rangeSchema,
  policySchema,
  type SessionInput,
} from "./schedule.schema";
import { ResourceService } from "./resource.service";
import { midnight, DAY } from "../memberships/membership.schema";
import type { Prisma } from "../../generated/prisma/client";
const include = {
  workout: true,
  hall: { select: { id: true, name: true, capacity: true } },
  trainer: {
    select: { id: true, user: { select: { name: true, avatarUrl: true } } },
  },
} satisfies Prisma.ScheduledSessionInclude;
@Injectable()
export class ScheduleService {
  constructor(
    private readonly db: Db,
    private readonly resources: ResourceService,
  ) {}
  async createOne(
    tx: Tx,
    auth: Principal,
    dto: SessionInput,
    seriesId?: string,
    occurrenceDate?: string,
  ) {
    const slot = {
      ...dto,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
    };
    const policy = await this.resources.policy(tx);
    if (dto.status === "PUBLISHED") {
      if (slot.startAt <= new Date())
        fail("SESSION_PAST", "Нельзя публиковать занятие в прошлом", 422);
    }
    await this.resources.check(
      tx,
      slot,
      policy,
      [],
      dto.status === "PUBLISHED",
    );
    const session = await tx.scheduledSession.create({
      data: { ...slot, seriesId, occurrenceDate, policySnapshot: policy },
    });
    if (session.status === "PUBLISHED")
      await this.resources.occupy(tx, session);
    await audit(tx, auth.id, "SESSION_CREATED", "Session", session.id, {
      status: session.status,
    });
    return session;
  }
  async create(auth: Principal, body: unknown, key?: string) {
    const dto = parse(sessionSchema, body);
    return idempotent(this.db, auth.id, "session-create", key, dto, (tx) =>
      this.createOne(tx, auth, dto),
    );
  }
  async previewOne(body: unknown) {
    const dto = parse(sessionSchema, body);
    return atomic(this.db, async (tx) => {
      if (new Date(dto.startAt) <= new Date())
        fail("SESSION_PAST", "Выберите будущее время");
      await this.resources.check(
        tx,
        { ...dto, startAt: new Date(dto.startAt), endAt: new Date(dto.endAt) },
        await this.resources.policy(tx),
      );
      return { count: 1, message: "Пересечений не найдено" };
    });
  }
  occurrences(body: unknown) {
    const dto = parse(seriesSchema, body);
    const start = midnight(dto.startDate),
      end = midnight(dto.endDate);
    const span = Math.round((end.getTime() - start.getTime()) / DAY);
    if (span < 0 || span > 55)
      fail("SERIES_RANGE", "Серия может охватывать не более 8 недель", 422);
    const items: Array<{ date: string; session: SessionInput }> = [];
    for (let i = 0; i <= span; i++) {
      const d = new Date(start.getTime() + i * DAY + 10800000),
        date = d.toISOString().slice(0, 10);
      if (
        !dto.weekdays.includes(d.getUTCDay()) ||
        dto.excludedDates.includes(date)
      )
        continue;
      const startAt = new Date(date + "T" + dto.startTime + ":00+03:00");
      items.push({
        date,
        session: {
          workoutId: dto.workoutId,
          trainerId: dto.trainerId,
          hallId: dto.hallId,
          capacity: dto.capacity,
          status: dto.status,
          startAt: startAt.toISOString(),
          endAt: new Date(
            startAt.getTime() + dto.durationMinutes * 60000,
          ).toISOString(),
        },
      });
    }
    if (!items.length || items.length > 500)
      fail("SERIES_EMPTY", "В выбранном диапазоне нет занятий", 422);
    return { dto, items };
  }
  async previewSeries(body: unknown) {
    const { items } = this.occurrences(body);
    return atomic(this.db, async (tx) => {
      const policy = await this.resources.policy(tx);
      for (const item of items) {
        if (new Date(item.session.startAt) <= new Date())
          fail("SESSION_PAST", "Серия содержит прошедшие занятия", 422);
        await this.resources.check(
          tx,
          {
            ...item.session,
            startAt: new Date(item.session.startAt),
            endAt: new Date(item.session.endAt),
          },
          policy,
        );
      }
      return {
        count: items.length,
        items: items.map((i) => ({
          date: i.date,
          startAt: i.session.startAt,
          endAt: i.session.endAt,
        })),
        message: "Пересечений не найдено",
      };
    });
  }
  async createSeries(auth: Principal, body: unknown, key?: string) {
    const { dto, items } = this.occurrences(body);
    return idempotent(
      this.db,
      auth.id,
      "series-create",
      key,
      dto,
      async (tx) => {
        const series = await tx.sessionSeries.create({
          data: { definition: dto, createdBy: auth.id },
        });
        const created = [];
        for (const item of items)
          created.push(
            await this.createOne(tx, auth, item.session, series.id, item.date),
          );
        return { seriesId: series.id, items: created };
      },
    );
  }
  async list(query: unknown, auth?: Principal) {
    const q = parse(rangeSchema, query);
    const staff = auth?.roles.some((r) =>
      ["OWNER", "ADMIN", "RECEPTION"].includes(r),
    );
    const trainer = auth?.roles.includes("TRAINER") && !staff;
    const where = {
      startAt: {
        gte: midnight(q.from),
        lt: new Date(midnight(q.to).getTime() + DAY),
      },
      ...(staff
        ? {}
        : { status: { in: ["PUBLISHED", "IN_PROGRESS", "COMPLETED"] } }),
      ...(q.workoutId ? { workoutId: q.workoutId } : {}),
      ...(q.hallId ? { hallId: q.hallId } : {}),
      ...(trainer
        ? {
            trainerId:
              auth!.trainerId ?? "00000000-0000-0000-0000-000000000000",
          }
        : q.trainerId
          ? { trainerId: q.trainerId }
          : {}),
      ...(q.level ? { workout: { level: q.level } } : {}),
    };
    const rows = await this.db.scheduledSession.findMany({
      where,
      include,
      orderBy: { startAt: "asc" },
      take: 1000,
    });
    return rows.map((s) => this.present(s));
  }
  present<
    T extends { status: string; startAt: Date; endAt: Date; capacity: number },
  >(s: T) {
    const now = new Date();
    const status =
      s.status === "PUBLISHED"
        ? s.endAt <= now
          ? "COMPLETED"
          : s.startAt <= now
            ? "IN_PROGRESS"
            : "PUBLISHED"
        : s.status;
    return { ...s, status, freePlaces: s.capacity };
  }
  async detail(id: string, auth?: Principal) {
    parse(uuid, id);
    const s = await this.db.scheduledSession.findUnique({
      where: { id },
      include,
    });
    if (!s) fail("NOT_FOUND", "Занятие не найдено", 404);
    const staff = auth?.roles.some((r) =>
      ["OWNER", "ADMIN", "RECEPTION"].includes(r),
    );
    if (s.status === "DRAFT" && !staff)
      fail("NOT_FOUND", "Занятие не найдено", 404);
    if (
      auth?.roles.includes("TRAINER") &&
      !staff &&
      auth.trainerId !== s.trainerId
    )
      fail("NOT_FOUND", "Занятие не найдено", 404);
    return this.present(s);
  }
  async affected(tx: Tx, id: string, scope: "ONE" | "FUTURE", version: number) {
    const initial = await tx.scheduledSession.findUnique({ where: { id } });
    if (!initial) fail("NOT_FOUND", "Занятие не найдено", 404);
    if (initial.version !== version)
      fail("VERSION_CONFLICT", "Расписание изменилось. Обновите страницу");
    if (initial.startAt <= new Date() && initial.status !== "DRAFT")
      fail("SESSION_PAST", "Прошедшее занятие нельзя изменить");
    const sessions =
      scope === "FUTURE" && initial.seriesId
        ? await tx.scheduledSession.findMany({
            where: {
              seriesId: initial.seriesId,
              startAt: { gte: initial.startAt },
              status: { not: "CANCELLED" },
            },
            orderBy: { id: "asc" },
          })
        : [initial];
    return { initial, sessions };
  }
  async edit(
    auth: Principal,
    id: string,
    body: unknown,
    key?: string,
    preview = false,
  ) {
    parse(uuid, id);
    const dto = parse(editSchema, body);
    const run = async (tx: Tx) => {
      const { initial, sessions } = await this.affected(
        tx,
        id,
        dto.scope,
        dto.version,
      );
      if (initial.status === "CANCELLED")
        fail("SESSION_CANCELLED", "Отменённое занятие нельзя изменить");
      if (initial.status !== "DRAFT" && dto.data.status === "DRAFT")
        fail(
          "PUBLISHED_SESSION",
          "Опубликованное занятие нельзя вернуть в черновик",
        );
      const delta =
          new Date(dto.data.startAt).getTime() - initial.startAt.getTime(),
        duration =
          new Date(dto.data.endAt).getTime() -
          new Date(dto.data.startAt).getTime();
      const changed = sessions.map((s) => ({
        old: s,
        slot: {
          workoutId: dto.data.workoutId,
          trainerId: dto.data.trainerId,
          hallId: dto.data.hallId,
          capacity: dto.data.capacity,
          startAt: new Date(s.startAt.getTime() + delta),
          endAt: new Date(s.startAt.getTime() + delta + duration),
        },
        policy:
          initial.status === "DRAFT"
            ? null
            : parse(policySchema, s.policySnapshot),
      }));
      const ids = sessions.map((s) => s.id);
      for (const item of changed) {
        if (item.slot.startAt <= new Date())
          fail("SESSION_PAST", "Нельзя перенести занятие в прошлое");
        if (dto.data.status === "PUBLISHED")
          await this.resources.check(
            tx,
            item.slot,
            item.policy ?? (await this.resources.policy(tx)),
            ids,
          );
      }
      if (preview)
        return {
          count: changed.length,
          items: changed.map((i) => ({
            id: i.old.id,
            startAt: i.slot.startAt,
            endAt: i.slot.endAt,
          })),
          message: "Перенос доступен",
        };
      await this.resources.release(tx, ids);
      const result = [];
      for (const item of changed) {
        const session = await tx.scheduledSession.update({
          where: { id: item.old.id },
          data: {
            ...item.slot,
            status: dto.data.status,
            policySnapshot: item.policy ?? (await this.resources.policy(tx)),
            version: { increment: 1 },
          },
        });
        if (session.status === "PUBLISHED")
          await this.resources.occupy(tx, session);
        await audit(
          tx,
          auth.id,
          "SESSION_CHANGED",
          "Session",
          session.id,
          {
            beforeStart: item.old.startAt.toISOString(),
            afterStart: session.startAt.toISOString(),
          },
          dto.reason,
        );
        result.push(session);
      }
      if (dto.scope === "FUTURE" && initial.seriesId)
        await tx.sessionSeries.update({
          where: { id: initial.seriesId },
          data: { version: { increment: 1 } },
        });
      return { count: result.length, items: result };
    };
    return preview
      ? atomic(this.db, run)
      : idempotent(this.db, auth.id, "session-edit:" + id, key, dto, run);
  }
  async cancel(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(cancelSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "session-cancel:" + id,
      key,
      dto,
      async (tx) => {
        const { sessions } = await this.affected(
          tx,
          id,
          dto.scope,
          dto.version,
        );
        const ids = sessions.map((s) => s.id);
        await this.resources.release(tx, ids);
        for (const s of sessions) {
          await tx.scheduledSession.update({
            where: { id: s.id },
            data: {
              status: "CANCELLED",
              cancelledReason: dto.reason,
              version: { increment: 1 },
            },
          });
          await audit(
            tx,
            auth.id,
            "SESSION_CANCELLED",
            "Session",
            s.id,
            {},
            dto.reason,
          );
        }
        return { count: ids.length, message: "Занятия отменены" };
      },
    );
  }
}
