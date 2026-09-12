import { z } from "zod";
import { label, text, version } from "../../common/validation";
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const tags = z.array(z.string().trim().min(1).max(60)).max(30).default([]);
export const clientSchema = z.strictObject({
  name: label,
  email: z.email().max(254).nullable().default(null),
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{10,20}$/)
    .nullable()
    .default(null),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export const hallSchema = z.strictObject({
  name: label,
  slug,
  description: text,
  capacity: z.number().int().min(1).max(500),
  equipment: tags,
  published: z.boolean().default(false),
});
export const workoutSchema = z
  .strictObject({
    name: label,
    slug,
    description: text,
    category: label,
    level: z
      .enum(["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"])
      .default("ALL"),
    durationMinutes: z.number().int().min(15).max(240).default(60),
    format: z.enum(["GROUP", "PERSONAL"]).default("GROUP"),
    capacity: z.number().int().min(1).max(500).default(12),
    equipment: tags,
    published: z.boolean().default(false),
  })
  .refine((v) => v.format !== "PERSONAL" || v.capacity === 1, {
    message: "Персональное занятие: одно место",
  });
export const trainerSchema = z.strictObject({
  bio: text,
  specialties: tags,
  published: z.boolean().default(false),
  active: z.boolean().default(true),
  workingHours: z
    .array(
      z
        .object({
          day: z.number().int().min(0).max(6),
          start: z.number().int().min(0).max(1439),
          end: z.number().int().min(1).max(1440),
        })
        .refine((v) => v.end > v.start),
    )
    .max(21)
    .default([]),
});
export const updateEnvelope = z.strictObject({ version, data: z.unknown() });
export const kinds = ["clients", "trainers", "halls", "workouts"] as const;
export const kindSchema = z.enum(kinds);
