import { z } from "zod";
import { uuid, reason, version } from "../../common/validation";
export const policySchema = z.object({
  bookingOpenDays: z.number().int().min(1).max(60).default(14),
  bookingCloseMinutes: z.number().int().min(0).max(240).default(15),
  cancelMinutes: z.number().int().min(0).max(1440).default(120),
  waitlistCutoffMinutes: z.number().int().min(15).max(240).default(60),
  attendanceBeforeMinutes: z.number().int().min(0).max(60).default(15),
  attendanceAfterHours: z.number().int().min(1).max(72).default(24),
  hallBufferMinutes: z.number().int().min(0).max(60).default(0),
  trainerBufferMinutes: z.number().int().min(0).max(60).default(0),
});
export type Policy = z.infer<typeof policySchema>;
export const sessionSchema = z
  .strictObject({
    workoutId: uuid,
    trainerId: uuid,
    hallId: uuid,
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    capacity: z.number().int().min(1).max(500),
    status: z.enum(["DRAFT", "PUBLISHED"]).default("PUBLISHED"),
  })
  .refine(
    (v) =>
      new Date(v.endAt).getTime() - new Date(v.startAt).getTime() >=
        15 * 60000 &&
      new Date(v.endAt).getTime() - new Date(v.startAt).getTime() <=
        240 * 60000,
    { message: "Длительность занятия от 15 до 240 минут" },
  );
export type SessionInput = z.infer<typeof sessionSchema>;
export const seriesSchema = z.strictObject({
  workoutId: uuid,
  trainerId: uuid,
  hallId: uuid,
  capacity: z.number().int().min(1).max(500),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("PUBLISHED"),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(240),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  excludedDates: z.array(z.iso.date()).max(100).default([]),
});
export const editSchema = z.strictObject({
  version,
  scope: z.enum(["ONE", "FUTURE"]).default("ONE"),
  data: sessionSchema,
  reason,
});
export const cancelSchema = z.strictObject({
  version,
  scope: z.enum(["ONE", "FUTURE"]).default("ONE"),
  reason,
});
export const rangeSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    trainerId: uuid.optional(),
    hallId: uuid.optional(),
    workoutId: uuid.optional(),
    level: z.enum(["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    available: z.enum(["true", "false"]).optional(),
  })
  .refine(
    (v) => {
      const days =
        (new Date(v.to).getTime() - new Date(v.from).getTime()) / 86400000;
      return days >= 0 && days <= 62;
    },
    { message: "Выберите период до 62 дней" },
  );
