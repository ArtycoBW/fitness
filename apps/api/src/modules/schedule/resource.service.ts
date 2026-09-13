import { Injectable, Module } from "@nestjs/common";
import { fail } from "../../common/business-error";
import { parse } from "../../common/validation";
import type { Tx } from "../../common/transaction";
import { policySchema, type Policy } from "./schedule.schema";
import type { ScheduledSession } from "../../generated/prisma/client";
export interface Slot {
  workoutId: string;
  trainerId: string;
  hallId: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
}
const normalized = (text: string) => text.trim().toLocaleLowerCase("ru-RU");
@Injectable()
export class ResourceService {
  async policy(tx: Tx): Promise<Policy> {
    const settings = await tx.clubSettings.findUnique({
      where: { id: "club" },
    });
    const data = settings?.settings as { bookingPolicy?: unknown } | undefined;
    return parse(policySchema, data?.bookingPolicy ?? {});
  }
  async check(
    tx: Tx,
    slot: Slot,
    policy: Policy,
    exclude: string[] = [],
    checkOccupancy = true,
  ) {
    const workout = await tx.workoutType.findUnique({
      where: { id: slot.workoutId },
    });
    const trainer = await tx.trainerProfile.findUnique({
      where: { id: slot.trainerId },
      include: { user: { select: { status: true, roles: true } } },
    });
    const hall = await tx.hall.findUnique({ where: { id: slot.hallId } });
    if (!workout || workout.archivedAt)
      fail("WORKOUT_UNAVAILABLE", "Направление недоступно");
    if (
      !trainer ||
      !trainer.active ||
      trainer.archivedAt ||
      trainer.user.status !== "ACTIVE" ||
      !trainer.user.roles.some((r) => r.role === "TRAINER")
    )
      fail("TRAINER_UNAVAILABLE", "Тренер недоступен");
    if (!hall || hall.archivedAt) fail("HALL_UNAVAILABLE", "Зал недоступен");
    if (
      slot.capacity > hall.capacity ||
      (workout.format === "PERSONAL" && slot.capacity !== 1)
    )
      fail(
        "CAPACITY_INVALID",
        "Вместимость превышает возможности зала или формат занятия",
        422,
      );
    if (
      !trainer.specialties
        .map(normalized)
        .includes(normalized(workout.category))
    )
      fail("SPECIALTY_MISMATCH", "У тренера нет нужной специализации", 422);
    if (
      workout.equipment.some(
        (e) => !hall.equipment.map(normalized).includes(normalized(e)),
      )
    )
      fail("EQUIPMENT_MISSING", "В зале нет необходимого оснащения", 422);
    const start = new Date(slot.startAt.getTime() + 10800000),
      end = new Date(slot.endAt.getTime() + 10800000);
    const startMinute = start.getUTCHours() * 60 + start.getUTCMinutes(),
      endMinute = end.getUTCHours() * 60 + end.getUTCMinutes();
    const hours = trainer.workingHours as Array<{
      day: number;
      start: number;
      end: number;
    }>;
    const endLocal =
      endMinute === 0 && end.getTime() > start.getTime() ? 1440 : endMinute;
    if (
      (start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10) &&
        endMinute !== 0) ||
      !hours.some(
        (h) =>
          h.day === start.getUTCDay() &&
          h.start <= startMinute &&
          h.end >= endLocal,
      )
    )
      fail(
        "TRAINER_HOURS",
        "Занятие находится вне рабочего времени тренера",
        422,
      );
    if (!checkOccupancy) return;
    const excluded = exclude.length
      ? { OR: [{ sessionId: null }, { sessionId: { notIn: exclude } }] }
      : {};
    const hallConflict = await tx.hallOccupancy.findFirst({
      where: {
        hallId: hall.id,
        active: true,
        startAt: {
          lt: new Date(slot.endAt.getTime() + policy.hallBufferMinutes * 60000),
        },
        endAt: { gt: slot.startAt },
        ...excluded,
      },
      select: { sessionId: true, closureId: true, startAt: true, endAt: true },
    });
    const trainerConflict = await tx.trainerOccupancy.findFirst({
      where: {
        trainerId: trainer.id,
        active: true,
        startAt: {
          lt: new Date(
            slot.endAt.getTime() + policy.trainerBufferMinutes * 60000,
          ),
        },
        endAt: { gt: slot.startAt },
        ...excluded,
      },
      select: { sessionId: true, absenceId: true, startAt: true, endAt: true },
    });
    if (hallConflict || trainerConflict)
      fail(
        "RESOURCE_CONFLICT",
        hallConflict
          ? "Зал занят в выбранное время"
          : "Тренер занят в выбранное время",
        409,
        { hallConflict, trainerConflict },
      );
  }
  async occupy(tx: Tx, session: ScheduledSession) {
    const policy = parse(policySchema, session.policySnapshot);
    await tx.hallOccupancy.upsert({
      where: { sessionId: session.id },
      create: {
        hallId: session.hallId,
        sessionId: session.id,
        startAt: session.startAt,
        endAt: new Date(
          session.endAt.getTime() + policy.hallBufferMinutes * 60000,
        ),
      },
      update: {
        hallId: session.hallId,
        startAt: session.startAt,
        endAt: new Date(
          session.endAt.getTime() + policy.hallBufferMinutes * 60000,
        ),
        active: true,
      },
    });
    await tx.trainerOccupancy.upsert({
      where: { sessionId: session.id },
      create: {
        trainerId: session.trainerId,
        sessionId: session.id,
        startAt: session.startAt,
        endAt: new Date(
          session.endAt.getTime() + policy.trainerBufferMinutes * 60000,
        ),
      },
      update: {
        trainerId: session.trainerId,
        startAt: session.startAt,
        endAt: new Date(
          session.endAt.getTime() + policy.trainerBufferMinutes * 60000,
        ),
        active: true,
      },
    });
  }
  async release(tx: Tx, ids: string[]) {
    await tx.hallOccupancy.updateMany({
      where: { sessionId: { in: ids } },
      data: { active: false },
    });
    await tx.trainerOccupancy.updateMany({
      where: { sessionId: { in: ids } },
      data: { active: false },
    });
  }
  async checkCatalogChange(tx: Tx, kind: string, id: string) {
    const filter =
      kind === "halls"
        ? { hallId: id }
        : kind === "trainers"
          ? { trainerId: id }
          : kind === "workouts"
            ? { workoutId: id }
            : null;
    if (!filter) return;
    const future = await tx.scheduledSession.findMany({
      where: {
        ...filter,
        startAt: { gt: new Date() },
        status: { in: ["PUBLISHED", "IN_PROGRESS"] },
      },
    });
    for (const s of future)
      await this.check(tx, s, parse(policySchema, s.policySnapshot), [s.id]);
  }
}
@Module({ providers: [ResourceService], exports: [ResourceService] })
export class ResourceModule {}
