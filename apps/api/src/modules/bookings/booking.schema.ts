import { z } from "zod";
import { uuid, reason, version } from "../../common/validation";
export const bookSchema = z.strictObject({
  sessionId: uuid,
  membershipId: uuid,
  clientId: uuid.optional(),
  waitlist: z.boolean().default(false),
});
export const cancelBookingSchema = z.strictObject({
  version,
  acceptLoss: z.boolean().default(false),
  reason: reason.optional(),
});
export const attendanceSchema = z.strictObject({
  status: z.enum(["ATTENDED", "NO_SHOW"]),
  version,
  reason: reason.optional(),
  correction: z.boolean().default(false),
});
