import { hash } from "argon2";
import { Db } from "./db";
import { env } from "./config";
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
