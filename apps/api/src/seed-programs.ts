import { randomUUID } from "node:crypto";
import { Db } from "./db";
import { ProgramService } from "./modules/programs/program.service";
import type { Principal } from "./modules/auth/access";
export async function seedPrograms(db: Db, ownerId: string, clientId: string) {
  const s = new ProgramService(db),
    trainer = await db.trainerProfile.findUniqueOrThrow({
      where: { slug: "anna-sokolova" },
    }),
    auth = { id: ownerId, name: "Артём Волков", roles: ["OWNER"] } as Principal;
  const definitions = [
    {
      name: "Приседание к опоре",
      category: "Сила",
      equipment: ["Стул"],
      metricType: "REPS",
      instructions:
        "Поставьте стопы на ширине таза. Отведите таз назад и мягко коснитесь опоры. Поднимитесь, сохраняя устойчивую опору на всю стопу.",
    },
    {
      name: "Ягодичный мост",
      category: "Пилатес",
      equipment: ["Коврик"],
      metricType: "REPS",
      instructions:
        "Лягте на спину, согните ноги. На выдохе поднимите таз до линии плеч и коленей. Опускайтесь плавно, без прогиба в пояснице.",
    },
    {
      name: "Птица — собака",
      category: "Стабилизация",
      equipment: ["Коврик"],
      metricType: "REPS",
      instructions:
        "Встаньте на четвереньки. Вытяните противоположные руку и ногу, сохраняя таз ровным. Вернитесь в исходное положение и смените сторону.",
    },
    {
      name: "Планка на предплечьях",
      category: "Стабилизация",
      equipment: ["Коврик"],
      metricType: "DURATION",
      instructions:
        "Расположите локти под плечами. Удерживайте прямую линию корпуса и спокойно дышите. При усталости опустите колени на коврик.",
    },
    {
      name: "Раскрытие грудного отдела",
      category: "Мобильность",
      equipment: ["Коврик"],
      metricType: "REPS",
      instructions:
        "Лягте на бок, согните колени. Плавно раскройте верхнюю руку назад, следуя за ней взглядом. Сохраняйте колени вместе и не форсируйте амплитуду.",
    },
    {
      name: "Растяжка сгибателей бедра",
      category: "Мобильность",
      equipment: ["Коврик"],
      metricType: "DURATION",
      instructions:
        "Из положения на одном колене слегка подкрутите таз. Перенесите вес вперёд до комфортного натяжения передней поверхности бедра. Дышите свободно.",
    },
  ];
  const exercises: Awaited<ReturnType<ProgramService["saveExercise"]>>[] = [];
  for (const data of definitions) {
    exercises.push(
      (await db.exercise.findFirst({ where: { name: data.name } })) ??
        (await s.saveExercise(auth, data)),
    );
  }
  if (
    await db.trainingProgram.findFirst({
      where: { title: "Уверенное начало", authorTrainerId: trainer.id },
    })
  )
    return;
  const p = await s.save(auth, {
    authorTrainerId: trainer.id,
    draft: {
      title: "Уверенное начало",
      goal: "Четыре недели для знакомства с базовыми движениями, контроля корпуса и регулярной практики.",
      level: "BEGINNER",
      weeks: 4,
      days: Array.from({ length: 8 }, (_, i) => ({
        weekNumber: Math.floor(i / 2) + 1,
        dayIndex: i % 2 === 0 ? 1 : 4,
        title: i % 2 === 0 ? "Опора и сила" : "Контроль и подвижность",
        exercises: exercises
          .filter((_, j) => (i % 2 === 0 ? j < 3 : j >= 3))
          .map((e) => ({
            exerciseId: e.id,
            sets: 2,
            reps: e.metricType === "REPS" ? 10 : null,
            durationSeconds: e.metricType === "DURATION" ? 30 : null,
            weightKg: null,
            restSeconds: 45,
            notes: "Работайте в комфортной амплитуде.",
          })),
      })),
    },
  });
  const v = await s.publish(auth, p.id, { version: p.version }, randomUUID());
  await s.assign(
    auth,
    {
      programVersionId: v.id,
      clientId,
      startsOn: new Date(Date.now() + 10800000).toISOString().slice(0, 10),
    },
    randomUUID(),
  );
}
