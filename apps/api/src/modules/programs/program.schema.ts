import { z } from "zod";
import { uuid, label, version, reason } from "../../common/validation";
export const exerciseSchema = z.strictObject({
  name: label,
  category: label,
  equipment: z.array(label).max(20).default([]),
  instructions: z.string().trim().min(10).max(3000),
  metricType: z.enum(["REPS", "DURATION"]),
});
export const prescription = z
  .strictObject({
    exerciseId: uuid,
    sets: z.number().int().min(1).max(10),
    reps: z.number().int().min(1).max(200).nullable(),
    durationSeconds: z.number().int().min(1).max(7200).nullable(),
    weightKg: z.number().min(0).max(500).nullable(),
    restSeconds: z.number().int().min(0).max(600),
    notes: z.string().trim().max(500).default(""),
  })
  .refine((v) => (v.reps !== null) !== (v.durationSeconds !== null), {
    message: "Задайте повторения или длительность",
  });
export const draftSchema = z
  .strictObject({
    title: label,
    goal: z.string().trim().min(3).max(1000),
    level: z.enum(["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    weeks: z.number().int().min(1).max(12),
    days: z
      .array(
        z.strictObject({
          weekNumber: z.number().int().min(1).max(12),
          dayIndex: z.number().int().min(1).max(7),
          title: label,
          exercises: z.array(prescription).min(1).max(20),
        }),
      )
      .min(1)
      .max(84),
  })
  .refine(
    (v) =>
      v.days.every((d) => d.weekNumber <= v.weeks) &&
      new Set(v.days.map((d) => d.weekNumber + ":" + d.dayIndex)).size ===
        v.days.length,
    { message: "Дни должны быть уникальны и находиться в пределах программы" },
  );
export const createProgram = z.strictObject({
  authorTrainerId: uuid.optional(),
  draft: draftSchema,
});
export const updateProgram = z.strictObject({ version, draft: draftSchema });
export const assignSchema = z.strictObject({
  programVersionId: uuid,
  clientId: uuid,
  startsOn: z.iso.date(),
});
export const replaceSchema = z.strictObject({
  version,
  programVersionId: uuid,
  startsOn: z.iso.date(),
  reason,
});
export const logSchema = z.strictObject({
  version: z.number().int().min(0),
  performedOn: z.iso.date(),
  completed: z.boolean(),
  comment: z.string().trim().max(1000).default(""),
  sets: z
    .array(
      z.strictObject({
        programExerciseId: uuid,
        setIndex: z.number().int().min(1).max(10),
        actualReps: z.number().int().min(1).max(500).nullable(),
        actualSeconds: z.number().int().min(1).max(14400).nullable(),
        actualWeightKg: z.number().min(0).max(500).nullable(),
      }),
    )
    .max(200),
});
