import { z } from "zod";
import { uuid, reason, version } from "../../common/validation";
export const orderSchema = z.strictObject({
  planVersionId: uuid,
  clientId: uuid.optional(),
  activationDate: z.iso.date(),
});
export const attemptSchema = z
  .strictObject({
    method: z.enum(["CARD", "ALFA_PAY", "YANDEX_PAY", "SBER_PAY"]),
    maskedLast4: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .refine((v) => v.method === "CARD" || !v.maskedLast4);
export const manualSchema = z.strictObject({
  method: z.enum(["CASH", "TERMINAL"]),
  reason,
});
export const refundSchema = z.strictObject({
  amountMinor: z.number().int().positive().max(100000000),
  entitlementAction: z.enum(["KEEP", "CANCEL"]),
  reason,
});
export const refundRequest = refundSchema.extend({
  membershipVersion: version,
});
