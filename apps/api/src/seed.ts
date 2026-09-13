import { hash } from "argon2";
import { Db } from "./db";
import { env } from "./config";
import { ResourceService } from "./modules/schedule/resource.service";
import { ScheduleService } from "./modules/schedule/schedule.service";
import { atomic } from "./common/transaction";
import type { Principal } from "./modules/auth/access";
async function seed() {
  if (env.NODE_ENV === "production")
    throw new Error("Seed is disabled in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set SEED_PASSWORD with at least 12 characters");
  const db = new Db();
  const passwordHash = await hash(password);
  try {
    const owner = await db.user.upsert({
      where: { email: "owner@stride.local" },
      update: {},
      create: {
        email: "owner@stride.local",
        name: "Артём Волков",
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: { role: "OWNER" } },
      },
    });
    await db.user.upsert({
      where: { email: "reception@stride.local" },
      update: {},
      create: {
        email: "reception@stride.local",
        name: "Дарья Лебедева",
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: { role: "RECEPTION" } },
      },
    });
    const client = await db.user.upsert({
      where: { email: "client@stride.local" },
      update: {},
      create: {
        email: "client@stride.local",
        name: "Александра Морозова",
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: { role: "CLIENT" } },
        client: {
          create: { name: "Александра Морозова", phone: "+79991234567" },
        },
      },
      include: { client: true },
    });
    const trainers = [
      {
        email: "trainer@stride.local",
        name: "Анна Соколова",
        slug: "anna-sokolova",
        specialties: ["Пилатес", "Мобильность"],
        bio: "Помогаю чувствовать тело увереннее: от первого занятия до устойчивой привычки. На тренировках работаем с осанкой, контролем движения и дыханием.",
      },
      {
        email: "maksim@stride.local",
        name: "Максим Орлов",
        slug: "maksim-orlov",
        specialties: ["Сила", "Функциональный тренинг"],
        bio: "Силовые и функциональные тренировки с вниманием к технике. Подбираю нагрузку под ваш опыт и постепенно усложняю программу.",
      },
      {
        email: "elena@stride.local",
        name: "Елена Миронова",
        slug: "elena-mironova",
        specialties: ["Йога", "Мобильность"],
        bio: "Спокойная практика для баланса, подвижности и внимания к себе. Помогаю найти комфортный темп и заметить собственный прогресс.",
      },
    ];
    for (const t of trainers) {
      const user = await db.user.upsert({
        where: { email: t.email },
        update: {},
        create: {
          email: t.email,
          name: t.name,
          passwordHash,
          emailVerifiedAt: new Date(),
          roles: { create: { role: "TRAINER" } },
          trainer: {
            create: {
              slug: t.slug,
              bio: t.bio,
              specialties: t.specialties,
              published: true,
              workingHours: [1, 2, 3, 4, 5, 6, 0].map((day) => ({
                day,
                start: 420,
                end: 1320,
              })),
            },
          },
        },
        include: { trainer: true },
      });
      if (t.email === "trainer@stride.local" && user.trainer && client.client)
        await db.trainerClient.upsert({
          where: {
            trainerId_clientId: {
              trainerId: user.trainer.id,
              clientId: client.client.id,
            },
          },
          update: {},
          create: { trainerId: user.trainer.id, clientId: client.client.id },
        });
    }
    const halls = [
      {
        slug: "studio",
        name: "Студия баланса",
        capacity: 12,
        description:
          "Светлое пространство для пилатеса, йоги и работы с подвижностью.",
        equipment: ["Коврики", "Блоки", "Резинки"],
      },
      {
        slug: "strength",
        name: "Зал силы",
        capacity: 16,
        description:
          "Всё для осознанной силовой работы: свободные веса и функциональная зона.",
        equipment: ["Гантели", "Гири", "Штанги", "Резинки"],
      },
      {
        slug: "personal",
        name: "Персональная студия",
        capacity: 4,
        description:
          "Камерный зал для индивидуальных занятий и разбора техники.",
        equipment: ["Коврики", "Гантели", "Резинки"],
      },
    ];
    for (const h of halls)
      await db.hall.upsert({
        where: { slug: h.slug },
        update: {},
        create: { ...h, published: true },
      });
    const workouts = [
      {
        slug: "pilates",
        name: "Пилатес",
        category: "Пилатес",
        description:
          "Собранность в каждом движении. Укрепляем глубокие мышцы, работаем с осанкой и контролем тела.",
        equipment: ["Коврики"],
        capacity: 12,
      },
      {
        slug: "strength",
        name: "Силовая тренировка",
        category: "Сила",
        description:
          "Становимся сильнее постепенно. Техника базовых движений, индивидуальный вес и понятный прогресс.",
        equipment: ["Гантели"],
        capacity: 16,
      },
      {
        slug: "yoga",
        name: "Йога",
        category: "Йога",
        description:
          "Время замедлиться. Соединяем дыхание и движение, возвращаем телу подвижность и равновесие.",
        equipment: ["Коврики", "Блоки"],
        capacity: 12,
      },
      {
        slug: "mobility",
        name: "Мобильность",
        category: "Мобильность",
        description:
          "Больше свободы в привычных движениях. Мягкая работа с диапазоном движения и стабильностью.",
        equipment: ["Коврики"],
        capacity: 12,
      },
      {
        slug: "functional",
        name: "Функциональный тренинг",
        category: "Функциональный тренинг",
        description:
          "Сила и выносливость для повседневной жизни. Работаем всем телом в динамичном, управляемом темпе.",
        equipment: ["Гири", "Резинки"],
        capacity: 12,
      },
    ];
    for (const w of workouts)
      await db.workoutType.upsert({
        where: { slug: w.slug },
        update: {},
        create: { ...w, published: true, durationMinutes: 60 },
      });
    for (const [index, name] of [
      "Михаил Андреев",
      "Виктория Зайцева",
      "Кирилл Новиков",
      "Мария Белова",
      "Денис Павлов",
      "Ольга Кузнецова",
      "Илья Фёдоров",
      "Екатерина Смирнова",
    ].entries()) {
      const email = "member" + index + "@stride.local";
      if (!(await db.clientProfile.findFirst({ where: { email } })))
        await db.clientProfile.create({
          data: { email, name, phone: "+79990000" + String(100 + index) },
        });
    }
    for (const p of [
      {
        slug: "start",
        title: "Первый шаг",
        description:
          "Одна тренировка, чтобы познакомиться с клубом и найти своё направление.",
        priceMinor: 90000,
        durationDays: 7,
        visitLimit: 1,
        freezeQuotaDays: 0,
      },
      {
        slug: "rhythm",
        title: "Свой ритм",
        description:
          "Восемь занятий в месяц — достаточно, чтобы движение стало привычкой.",
        priceMinor: 490000,
        durationDays: 30,
        visitLimit: 8,
        freezeQuotaDays: 7,
      },
      {
        slug: "freedom",
        title: "Свобода движения",
        description:
          "Все направления в удобном темпе. Приходите, когда хочется двигаться.",
        priceMinor: 790000,
        durationDays: 30,
        visitLimit: null,
        freezeQuotaDays: 7,
      },
    ]) {
      const { slug, ...terms } = p;
      await db.membershipPlan.upsert({
        where: { slug },
        update: {},
        create: {
          slug,
          name: terms.title,
          published: true,
          versions: { create: { ...terms, number: 1 } },
        },
      });
    }
    const schedule = new ScheduleService(db, new ResourceService());
    const actor = { id: owner.id, roles: ["OWNER"] } as Principal;
    const firstDay = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
    for (let offset = 0; offset < 14; offset++) {
      const day = new Date(
        new Date(firstDay + "T12:00:00Z").getTime() + offset * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      for (const [workoutSlug, trainerSlug, hallSlug, time] of [
        ["pilates", "anna-sokolova", "studio", "08:00"],
        ["strength", "maksim-orlov", "strength", "09:00"],
        ["yoga", "elena-mironova", "studio", "18:00"],
        ["mobility", "anna-sokolova", "studio", "19:30"],
      ]) {
        const startAt = new Date(day + "T" + time + ":00+03:00");
        if (startAt <= new Date()) continue;
        const workout = await db.workoutType.findUniqueOrThrow({
            where: { slug: workoutSlug },
          }),
          trainer = await db.trainerProfile.findUniqueOrThrow({
            where: { slug: trainerSlug },
          }),
          hall = await db.hall.findUniqueOrThrow({ where: { slug: hallSlug } });
        if (
          !(await db.scheduledSession.findFirst({
            where: { workoutId: workout.id, trainerId: trainer.id, startAt },
          }))
        )
          await atomic(db, (tx) =>
            schedule.createOne(tx, actor, {
              workoutId: workout.id,
              trainerId: trainer.id,
              hallId: hall.id,
              startAt: startAt.toISOString(),
              endAt: new Date(startAt.getTime() + 3600000).toISOString(),
              capacity: Math.min(hall.capacity, workout.capacity),
              status: "PUBLISHED",
            }),
          );
      }
    }
    await db.auditLog.create({
      data: {
        actorId: owner.id,
        action: "SEED_CREATED",
        entityType: "Club",
        entityId: "club",
      },
    });
    console.log(
      "Development club fixtures ready. Existing records were preserved.",
    );
  } finally {
    await db.$disconnect();
  }
}
void seed();
