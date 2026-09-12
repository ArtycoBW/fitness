import { z } from "zod";
import { label, text, uuid, version, reason } from "../../common/validation";
export const termsSchema = z
  .strictObject({
    title: label,
    description: text,
    priceMinor: z.number().int().min(100).max(100000000),
    durationDays: z.number().int().min(1).max(730),
    visitLimit: z.number().int().min(1).max(10000).nullable(),
    freezeQuotaDays: z.number().int().min(0).max(90).default(0),
    activationWindowDays: z.number().int().min(0).max(30).default(30),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .default([0, 1, 2, 3, 4, 5, 6]),
    startMinute: z.number().int().min(0).max(1439).default(0),
    endMinute: z.number().int().min(1).max(1440).default(1440),
    workoutIds: z.array(uuid).max(100).default([]),
    trainerIds: z.array(uuid).max(100).default([]),
    hallIds: z.array(uuid).max(100).default([]),
  })
  .refine((v) => v.endMinute > v.startMinute, {
    message: "Конец интервала должен быть позже начала",
  });
export type Terms = z.infer<typeof termsSchema>;
export const planSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  published: z.boolean().default(false),
  terms: termsSchema,
});
export const planUpdate = z.strictObject({ version, data: planSchema });
export const freezeSchema = z.strictObject({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: reason.optional(),
});
export const freezeChange = z.strictObject({
  endDate: z.iso.date().optional(),
  reason,
});
export const adjustSchema = z.strictObject({
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((n) => n !== 0),
  reason,
});
export const clubDay = (date = new Date()) =>
  new Date(date.getTime() + 10800000).toISOString().slice(0, 10);
export const midnight = (date: string) => new Date(date + "T00:00:00+03:00");
export const DAY = 86400000;
