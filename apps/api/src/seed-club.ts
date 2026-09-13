import { createHash, randomUUID } from "node:crypto";
import { Db } from "./db";
import { atomic } from "./common/transaction";
import type { Principal } from "./modules/auth/access";
import { ScheduleService } from "./modules/schedule/schedule.service";
import { ResourceService } from "./modules/schedule/resource.service";
import { MembershipService } from "./modules/memberships/membership.service";
import { EntitlementService } from "./modules/memberships/entitlement.service";
import { PaymentService } from "./modules/payments/payment.service";
import { InternalPaymentProvider } from "./modules/payments/payment.provider";
import { BookingCore } from "./modules/bookings/booking-core.service";
import { ProgramService } from "./modules/programs/program.service";
import {
  clubDay,
  midnight,
  DAY,
} from "./modules/memberships/membership.schema";

// Additive development fixtures. Stable identifiers make reruns safe; customer records
// outside the reserved stride.local addresses are selected only with an explicit target.
const fixtureId = (key: string) => {
  const h = createHash("sha256")
    .update("stride-club-v2:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export async function seedClub(
  db: Db,
  ownerId: string,
  passwordHash: string,
  targetEmail?: string,
) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Activity fixtures are disabled in production");
  const target = targetEmail
    ? await db.clientProfile.findFirstOrThrow({
        where: { user: { email: targetEmail } },
      })
    : null;
  const actor = {
    id: ownerId,
    name: "Артём Волков",
    roles: ["OWNER"],
  } as Principal;
  const rights = new EntitlementService(),
    resources = new ResourceService();
  const plans = new MembershipService(db, rights),
    schedule = new ScheduleService(db, resources);
  const payments = new PaymentService(
      db,
      plans,
      rights,
      new InternalPaymentProvider(),
    ),
    bookings = new BookingCore(db),
    programs = new ProgramService(db);
  const today = clubDay(),
    date = (offset: number) =>
      clubDay(new Date(midnight(today).getTime() + offset * DAY));
  const trainers = await db.trainerProfile.findMany({
    where: {
      slug: { in: ["anna-sokolova", "maksim-orlov", "elena-mironova"] },
    },
    include: { user: true },
  });
  const hallList = await db.hall.findMany({
    where: { slug: { in: ["strength", "studio", "personal"] } },
  });
  const workouts = await db.workoutType.findMany({
    where: {
      slug: { in: ["yoga", "pilates", "strength", "mobility", "functional"] },
    },
  });
  // Existing morning/evening classes remain intact. Add lunch, afternoon and individual slots.
  for (let offset = 0; !target && offset < 28; offset++) {
    for (const [workoutSlug, trainerSlug, hallSlug, time] of [
      ["mobility", "elena-mironova", "studio", "10:30"],
      ["strength", "maksim-orlov", "personal", "12:00"],
      ["pilates", "anna-sokolova", "studio", "13:30"],
      ["functional", "maksim-orlov", "strength", "16:00"],
      ["yoga", "elena-mironova", "studio", "20:30"],
    ]) {
      const startAt = new Date(`${date(offset)}T${time}:00+03:00`),
        endAt = new Date(startAt.getTime() + 3600000);
      if (startAt.getTime() < Date.now() + 3600000) continue;
      const trainer = trainers.find((t) => t.slug === trainerSlug)!,
        hall = hallList.find((h) => h.slug === hallSlug)!,
        workout = workouts.find((w) => w.slug === workoutSlug)!;
      const conflict = await db.scheduledSession.findFirst({
        where: {
          status: "PUBLISHED",
          startAt: { lt: endAt },
          endAt: { gt: startAt },
          OR: [{ hallId: hall.id }, { trainerId: trainer.id }],
        },
      });
      if (conflict) continue;
      await atomic(db, (tx) =>
        schedule.createOne(tx, actor, {
          workoutId: workout.id,
          trainerId: trainer.id,
          hallId: hall.id,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          capacity: Math.min(workout.capacity, hall.capacity),
          status: "PUBLISHED",
        }),
      );
    }
  }
  const names = [
    "Софья Романова",
    "Андрей Соколов",
    "Полина Егорова",
    "Алексей Мельников",
    "Анастасия Орлова",
    "Роман Васильев",
    "Алина Лебедева",
    "Никита Захаров",
    "Юлия Ковалева",
    "Павел Миронов",
    "Вера Соловьёва",
    "Сергей Громов",
    "Татьяна Лазарева",
    "Матвей Крылов",
    "Дарья Никитина",
    "Антон Данилов",
  ];
  for (const [i, name] of (target ? [] : names).entries()) {
    const email = `club${i + 1}@stride.local`;
    await db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: { role: "CLIENT" } },
        client: {
          create: {
            name,
            email,
            phone: "+7999200" + String(1100 + i),
            joinedAt: midnight(date(-45 - i * 3)),
          },
        },
      },
    });
  }
  const clients = target
    ? [target]
    : await db.clientProfile.findMany({
        where: {
          OR: [
            { email: { in: names.map((_, i) => `club${i + 1}@stride.local`) } },
            { user: { email: "client@stride.local" } },
            {
              email: {
                in: Array.from(
                  { length: 8 },
                  (_, i) => `member${i}@stride.local`,
                ),
              },
            },
          ],
        },
        orderBy: { name: "asc" },
      });
  const rhythm = await db.membershipPlan.findUniqueOrThrow({
    where: { slug: "rhythm" },
    include: { versions: { orderBy: { number: "desc" }, take: 1 } },
  });
  const freedom = await db.membershipPlan.findUniqueOrThrow({
    where: { slug: "freedom" },
    include: { versions: { orderBy: { number: "desc" }, take: 1 } },
  });
  const future = await db.scheduledSession.findMany({
    where: {
      status: "PUBLISHED",
      startAt: { gte: new Date(Date.now() + DAY), lt: midnight(date(10)) },
    },
    orderBy: { startAt: "asc" },
  });
  for (const [i, client] of clients.entries()) {
    const planVersionId = (i % 3 === 0 ? freedom : rhythm).versions[0]!.id;
    // Each seeded customer has one membership and payment, not another purchase on every seed run.
    const key = fixtureId("order:" + client.id);
    let record = await db.idempotencyRecord.findUnique({
      where: {
        actorId_route_key: { actorId: actor.id, route: "order-create", key },
      },
    });
    if (!record)
      await payments.createOrder(
        actor,
        { clientId: client.id, planVersionId, activationDate: today },
        key,
      );
    record = await db.idempotencyRecord.findUniqueOrThrow({
      where: {
        actorId_route_key: { actorId: actor.id, route: "order-create", key },
      },
    });
    const orderId = (record.response as { id: string }).id;
    let membership = await db.membership.findUnique({ where: { orderId } });
    if (!membership) {
      const method = [
        "CARD",
        "ALFA_PAY",
        "YANDEX_PAY",
        "SBER_PAY",
        "CASH",
        "TERMINAL",
      ][i % 6]!;
      const manual = ["CASH", "TERMINAL"].includes(method);
      const p = await payments.attempt(
        actor,
        orderId,
        manual
          ? { method, reason: "Оплата абонемента на стойке клуба" }
          : {
              method,
              ...(method === "CARD" ? { maskedLast4: String(4100 + i) } : {}),
            },
        fixtureId("payment:" + client.id),
        manual,
      );
      if (!manual)
        await atomic(db, async (tx) =>
          payments.completePayment(
            tx,
            await tx.paymentAttempt.findUniqueOrThrow({ where: { id: p.id } }),
            "SUCCEEDED",
          ),
        );
      membership = await db.membership.findUniqueOrThrow({
        where: { orderId },
      });
    }
    if (membership.endAt <= new Date() || membership.cancelledAt) continue;
    const trainer = trainers[i % trainers.length]!;
    await db.trainerClient.upsert({
      where: {
        trainerId_clientId: { trainerId: trainer.id, clientId: client.id },
      },
      update: {},
      create: { trainerId: trainer.id, clientId: client.id },
    });
    const selected = future
      .filter((s) => s.trainerId === trainer.id)
      .slice(i % 3, (i % 3) + (target ? 6 : 3));
    for (const session of selected) {
      if (
        await db.booking.findUnique({
          where: {
            clientId_sessionId: { clientId: client.id, sessionId: session.id },
          },
        })
      )
        continue;
      const count = await db.booking.count({
        where: { sessionId: session.id, status: "CONFIRMED" },
      });
      if (count >= session.capacity - 1) continue;
      const conflict = await db.clientOccupancy.findFirst({
        where: {
          clientId: client.id,
          active: true,
          startAt: { lt: session.endAt },
          endAt: { gt: session.startAt },
        },
      });
      if (conflict) continue;
      await bookings.book(
        actor,
        {
          clientId: client.id,
          membershipId: membership.id,
          sessionId: session.id,
        },
        fixtureId("booking:" + client.id + ":" + session.id),
      );
    }
  }
  // Historical fixture records are imported atomically with their payment snapshots,
  // booking events and entitlement ledger. They do not bypass a live API permission.
  const historicalTerms = (
    await atomic(db, (tx) => plans.snapshot(tx, freedom.versions[0]!.id))
  ).terms;
  const policy = await atomic(db, (tx) => resources.policy(tx));
  for (const [i, client] of clients.entries()) {
    const orderId = fixtureId("history-order:" + client.id);
    if (await db.order.findUnique({ where: { id: orderId } })) continue;
    const paidAt = new Date(
      midnight(date(-21 - (i % 7))).getTime() + 9 * 3600000,
    );
    await atomic(db, async (tx) => {
      await tx.order.create({
        data: {
          id: orderId,
          clientId: client.id,
          planVersionId: freedom.versions[0]!.id,
          totalMinor: historicalTerms.priceMinor,
          status: "PAID",
          activationDate: midnight(date(-21)),
          productSnapshot: historicalTerms,
          expiresAt: new Date(paidAt.getTime() + 1800000),
          paidAt,
          createdAt: paidAt,
          createdBy: ownerId,
        },
      });
      const m = await rights.issue(tx, orderId);
      const payment = await tx.paymentAttempt.create({
        data: {
          orderId,
          method: i % 2 ? "CARD" : "SBER_PAY",
          status: "SUCCEEDED",
          amountMinor: historicalTerms.priceMinor,
          confirmedAt: paidAt,
          createdAt: paidAt,
          nextCheckAt: paidAt,
          checkCount: 1,
          maskedLast4: i % 2 ? String(8100 + i) : null,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          provider: payment.provider,
          providerEventId: payment.providerPaymentId + ":SUCCEEDED",
          eventType: "SUCCEEDED",
          receivedAt: paidAt,
          processedAt: paidAt,
        },
      });
      await tx.paymentConfirmation.create({
        data: {
          paymentId: payment.id,
          issuedAt: paidAt,
          reference:
            "ST" + orderId.replaceAll("-", "").slice(0, 16).toUpperCase(),
          immutableSnapshot: {
            paymentId: payment.id,
            orderId,
            membershipId: m.id,
            title: historicalTerms.title,
            clientName: client.name,
            amountMinor: payment.amountMinor,
            currency: "RUB",
            method: payment.method,
            maskedLast4: payment.maskedLast4,
            date: paidAt.toISOString(),
          },
        },
      });
      const trainer = trainers[i % trainers.length]!,
        workout = workouts.find(
          (w) =>
            w.slug ===
            (trainer.slug === "maksim-orlov"
              ? "strength"
              : trainer.slug === "elena-mironova"
                ? "yoga"
                : "pilates"),
        )!,
        hall = hallList.find(
          (h) =>
            h.slug ===
            (trainer.slug === "maksim-orlov" ? "strength" : "studio"),
        )!;
      for (let n = 0; n < 4; n++) {
        const sessionId = fixtureId("history-session:" + trainer.id + ":" + n),
          startAt = new Date(
            `${date(-12 + n * 2)}T${trainer.slug === "elena-mironova" ? "18" : "09"}:00:00+03:00`,
          ),
          endAt = new Date(startAt.getTime() + 3600000);
        const s = await tx.scheduledSession.upsert({
          where: { id: sessionId },
          update: {},
          create: {
            id: sessionId,
            workoutId: workout.id,
            trainerId: trainer.id,
            hallId: hall.id,
            startAt,
            endAt,
            capacity: Math.min(workout.capacity, hall.capacity),
            status: "COMPLETED",
            policySnapshot: policy,
          },
        });
        const b = await tx.booking.create({
          data: {
            clientId: client.id,
            sessionId: s.id,
            membershipId: m.id,
            status: i % 7 === 0 && n === 3 ? "NO_SHOW" : "ATTENDED",
            balanceState: "CONSUMED",
            attendanceAt: endAt,
            createdAt: new Date(startAt.getTime() - DAY),
            queuedAt: new Date(startAt.getTime() - DAY),
          },
        });
        await rights.movement(
          tx,
          m.id,
          "RESERVE",
          "history:reserve:" + b.id,
          ownerId,
          b.id,
        );
        await rights.movement(
          tx,
          m.id,
          "CONSUME",
          "history:consume:" + b.id,
          ownerId,
          b.id,
        );
        await tx.bookingEvent.create({
          data: {
            bookingId: b.id,
            eventKey: "history:attendance:" + b.id,
            fromStatus: "CONFIRMED",
            toStatus: b.status,
            actorId: ownerId,
            createdAt: endAt,
          },
        });
      }
      await tx.membership.update({
        where: { id: m.id },
        data: { createdAt: paidAt },
      });
    });
  }
  const exercises = await db.exercise.findMany({
    where: { archivedAt: null },
    take: 6,
    orderBy: { name: "asc" },
  });
  const definitions = [
    {
      title: "Сильная спина",
      goal: "Постепенно укрепить мышцы спины и корпуса, улучшить контроль осанки в повседневных движениях.",
      trainer: "anna-sokolova",
      level: "BEGINNER",
    },
    {
      title: "База силы",
      goal: "Освоить базовые силовые движения и научиться повышать рабочую нагрузку с сохранением техники.",
      trainer: "maksim-orlov",
      level: "INTERMEDIATE",
    },
    {
      title: "Свобода движения",
      goal: "Развить подвижность тазобедренных суставов и грудного отдела, выстроить регулярную мягкую практику.",
      trainer: "elena-mironova",
      level: "ALL",
    },
  ];
  for (const [index, def] of definitions.entries()) {
    const trainer = trainers.find((t) => t.slug === def.trainer)!;
    let program = await db.trainingProgram.findFirst({
      where: { title: def.title, authorTrainerId: trainer.id },
    });
    if (!program) {
      const created = await programs.save(actor, {
        authorTrainerId: trainer.id,
        draft: {
          title: def.title,
          goal: def.goal,
          level: def.level,
          weeks: 4,
          days: Array.from({ length: 8 }, (_, n) => ({
            weekNumber: Math.floor(n / 2) + 1,
            dayIndex: n % 2 ? 4 : 1,
            title:
              n % 2 ? "Контроль и восстановление" : "Техника и устойчивость",
            exercises: exercises.slice(index, index + 3).map((e) => ({
              exerciseId: e.id,
              sets: 3,
              reps: e.metricType === "REPS" ? 12 : null,
              durationSeconds: e.metricType === "DURATION" ? 35 : null,
              weightKg: null,
              restSeconds: 45,
              notes: "Сохраняйте ровное дыхание и комфортную амплитуду.",
            })),
          })),
        },
      });
      await programs.publish(
        actor,
        created.id,
        { version: created.version },
        randomUUID(),
      );
      program = await db.trainingProgram.findUniqueOrThrow({
        where: { id: created.id },
      });
    }
    const version = await db.programVersion.findFirstOrThrow({
      where: { programId: program.id },
      orderBy: { number: "desc" },
      include: {
        days: {
          orderBy: [{ weekNumber: "asc" }, { dayIndex: "asc" }],
          include: { exercises: true },
        },
      },
    });
    for (const client of clients.filter((_, i) => target || i % 3 === index)) {
      let assignment = await db.programAssignment.findFirst({
        where: { programId: program.id, clientId: client.id },
      });
      if (!assignment)
        assignment = await programs.assign(
          actor,
          {
            programVersionId: version.id,
            clientId: client.id,
            startsOn: today,
          },
          fixtureId("assign:" + program.id + client.id),
        );
      if (!client.userId || assignment.status !== "ACTIVE") continue;
      const day = version.days[0]!;
      if (
        !(await db.programDayLog.findUnique({
          where: {
            assignmentId_dayId: { assignmentId: assignment.id, dayId: day.id },
          },
        }))
      ) {
        await programs.saveLog(
          {
            id: client.userId,
            clientId: client.id,
            roles: ["CLIENT"],
          } as Principal,
          assignment.id,
          day.id,
          {
            version: 0,
            performedOn: today,
            completed: true,
            comment:
              "Все подходы выполнены в комфортном темпе. В последнем подходе удалось сохранить технику.",
            sets: day.exercises.flatMap((e) =>
              Array.from({ length: e.sets }, (_, n) => ({
                programExerciseId: e.id,
                setIndex: n + 1,
                actualReps: e.reps,
                actualSeconds: e.durationSeconds,
                actualWeightKg: null,
              })),
            ),
          },
          fixtureId("log:" + assignment.id),
        );
      }
      if (
        !(await db.programComment.findFirst({
          where: { assignmentId: assignment.id },
        }))
      )
        await programs.comment(
          actor,
          assignment.id,
          {
            body: "Хорошее начало. На следующем занятии проверим устойчивость корпуса и разберём движения, в которых хочется больше уверенности.",
            visibility: "SHARED",
          },
          fixtureId("comment:" + assignment.id),
        );
    }
  }
  if (!target)
    for (const [i, message] of [
      "Хочу подобрать занятия для спины после рабочего дня.",
      "Интересуют персональные тренировки два раза в неделю.",
      "Можно прийти на йогу с нулевым опытом?",
      "Ищу абонемент с возможностью заморозки на отпуск.",
      "Хочу познакомиться с тренером по силовой подготовке.",
      "Подскажите утренние занятия по пилатесу.",
    ].entries()) {
      const id = fixtureId("lead:" + i),
        status = ["NEW", "CONTACTED", "CLOSED"][i % 3]!;
      await db.lead.upsert({
        where: { id },
        update: {},
        create: {
          id,
          name: names[i]!,
          phone: "+7999400110" + i,
          message,
          status,
          createdAt: midnight(date(-i)),
          events: {
            create: {
              actorId: ownerId,
              status,
              note:
                i % 3 === 2
                  ? "Подобрано удобное время для посещения клуба."
                  : "Обращение получено, уточняем удобное время для связи.",
            },
          },
        },
      });
    }
  console.log(
    `Club activity ready: ${clients.length} clients, 28 days of classes, memberships, payments and training plans.`,
  );
}
