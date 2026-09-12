import { z } from "zod";
import { fail } from "./business-error";
export function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    fail("VALIDATION_ERROR", "Проверьте заполненные поля", 400, {
      fields: result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  return result.data;
}
export const uuid = z.uuid();
export const label = z.string().trim().min(2).max(100);
export const reason = z.string().trim().min(3).max(500);
export const text = z.string().trim().max(5000).default("");
export const version = z.number().int().positive();
export const listQuery = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  archived: z.enum(["true", "false"]).default("false"),
  sort: z.enum(["name", "recent"]).default("name"),
});
export const period = z
  .object({ startAt: z.iso.datetime(), endAt: z.iso.datetime(), reason })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: "Конец должен быть позже начала",
  });
