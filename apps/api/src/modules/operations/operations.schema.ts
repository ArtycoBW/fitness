import { z } from "zod";
import {
  label,
  version,
  reason,
  uuid,
  listQuery,
} from "../../common/validation";
import { policySchema } from "../schedule/schedule.schema";
export const contactSchema = z.strictObject({
  name: label,
  phone: z.string().regex(/^\+?[0-9 ()-]{10,20}$/),
  email: z.email().max(254).nullable().default(null),
  message: z.string().trim().min(3).max(2000),
  consent: z.literal(true),
  website: z.string().max(100).default(""),
});
export const leadUpdate = z.strictObject({
  version,
  status: z.enum(["NEW", "CONTACTED", "SCHEDULED", "WON", "CLOSED"]),
  assignedTo: uuid.nullable(),
  note: reason,
});
export const clubData = z.strictObject({
  name: label,
  address: z.string().trim().max(300),
  phone: z.string().trim().max(30),
  email: z.email().max(254),
  hours: z.string().trim().max(300),
  legalName: z.string().trim().max(300),
  bookingPolicy: policySchema,
});
export const clubUpdate = z.strictObject({ version, data: clubData, reason });
export const reportQuery = listQuery
  .extend({
    kind: z.enum(["FINANCE", "ATTENDANCE", "RESOURCES", "MEMBERSHIPS"]),
    from: z.iso.date(),
    to: z.iso.date(),
    trainerId: uuid.optional(),
    hallId: uuid.optional(),
    workoutId: uuid.optional(),
    staffId: uuid.optional(),
    method: z
      .enum(["CARD", "ALFA_PAY", "YANDEX_PAY", "SBER_PAY", "CASH", "TERMINAL"])
      .optional(),
  })
  .refine(
    (q) =>
      q.to >= q.from && Date.parse(q.to) - Date.parse(q.from) <= 366 * 86400000,
    { message: "Период от одного дня до года" },
  );
