import { HttpException } from "@nestjs/common";
import { Db } from "./db";
import { env } from "./config";
import { atomic } from "./common/transaction";
import type { Principal } from "./modules/auth/access";
import { ScheduleService } from "./modules/schedule/schedule.service";
import { ResourceService } from "./modules/schedule/resource.service";
import {
  clubDay,
  DAY,
  midnight,
} from "./modules/memberships/membership.schema";

const trainers = [
  {
    slug: "daria-volkova",
    name: "Дарья Волкова",
    specialties: ["Пилатес", "Мобильность"],
    workout: "pilates",
    hall: "studio",
    time: "11:45",
    bio: "Учу двигаться свободно и без спешки. На пилатесе разбираем каждое движение, укрепляем мышцы корпуса и постепенно развиваем контроль. Подберу варианты упражнений для вашего уровня.",
  },
  {
    slug: "ivan-lebedev",
    name: "Иван Лебедев",
    specialties: ["Сила", "Функциональный тренинг"],
    workout: "strength",
    hall: "strength",
    time: "10:30",
    bio: "Помогаю освоить свободные веса и уверенно чувствовать себя в зале. Сначала ставим технику, затем увеличиваем нагрузку. В программе всегда есть понятная цель и время на восстановление.",
  },
  {
    slug: "sofia-belova",
    name: "София Белова",
    specialties: ["Йога", "Мобильность"],
    workout: "yoga",
    hall: "studio",
    time: "15:00",
    bio: "Веду мягкую йогу с вниманием к дыханию и подвижности. Практика подходит для знакомства с йогой и спокойного возвращения к тренировкам. Сложность меняем вместе, по вашим ощущениям.",
  },
  {
    slug: "nikita-morozov",
    name: "Никита Морозов",
    specialties: ["Функциональный тренинг", "Сила"],
    workout: "functional",
    hall: "strength",
    time: "18:30",
    bio: "Развиваем выносливость, координацию и силу для повседневной жизни. Сочетаю упражнения с собственным весом и оборудованием. Помогу выбрать свой темп и увидеть прогресс от недели к неделе.",
  },
];

/** Additive development fixtures: preserves existing staff and booking history. */
export async function seedAdditionalTrainers(
  db: Db,
  ownerId: string,
  passwordHash: string,
) {
  if (env.NODE_ENV === "production")
    throw new Error("Seed is disabled in production");
  const schedule = new ScheduleService(db, new ResourceService());
  const actor = { id: ownerId, roles: ["OWNER"] } as Principal;
  for (const t of trainers) {
    const user = await db.user.upsert({
      where: { email: `${t.slug}@stride.local` },
      update: {},
      create: {
        email: `${t.slug}@stride.local`,
        name: t.name,
        avatarUrl: `/media/editorial/${t.slug}.webp`,
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: { role: "TRAINER" } },
        trainer: {
          create: {
            slug: t.slug,
            bio: t.bio,
            specialties: t.specialties,
            published: true,
            workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
              day,
              start: 420,
              end: 1320,
            })),
          },
        },
      },
      include: { trainer: true },
    });
    if (!user.trainer) continue;
    const trainerId = user.trainer.id;
    const workout = await db.workoutType.findUniqueOrThrow({
      where: { slug: t.workout },
    });
    const hall = await db.hall.findUniqueOrThrow({ where: { slug: t.hall } });
    for (let offset = 0; offset < 14; offset++) {
      const day = clubDay(
        new Date(midnight(clubDay()).getTime() + offset * DAY),
      );
      const startAt = new Date(`${day}T${t.time}:00+03:00`);
      if (startAt.getTime() < Date.now() + 3600000) continue;
      if (
        await db.scheduledSession.findFirst({ where: { trainerId, startAt } })
      )
        continue;
      try {
        await atomic(db, (tx) =>
          schedule.createOne(tx, actor, {
            workoutId: workout.id,
            trainerId,
            hallId: hall.id,
            startAt: startAt.toISOString(),
            endAt: new Date(startAt.getTime() + 3600000).toISOString(),
            capacity: Math.min(hall.capacity, workout.capacity),
            status: "PUBLISHED",
          }),
        );
      } catch (e) {
        // An existing reservation or closure owns this slot. Never replace it.
        if (
          !(e instanceof HttpException) ||
          (e.getResponse() as { code?: string }).code !== "RESOURCE_CONFLICT"
        )
          throw e;
      }
    }
  }
}
