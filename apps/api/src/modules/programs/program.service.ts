import { Injectable } from "@nestjs/common";
import { areaPrincipal } from "../../common/area";
import { z } from "zod";
import { Db } from "../../db";
import {
  parse,
  uuid,
  listQuery,
  reason,
  version,
} from "../../common/validation";
import { atomic, audit, changed, type Tx } from "../../common/transaction";
import { idempotent } from "../../common/idempotency";
import { fail } from "../../common/business-error";
import { seal } from "../../common/crypto";
import type { Principal } from "../auth/access";
import type {
  ProgramAssignment,
  TrainingProgram,
  Prisma,
} from "../../generated/prisma/client";
import { clubDay, midnight, DAY } from "../memberships/membership.schema";
import {
  exerciseSchema,
  draftSchema,
  createProgram,
  updateProgram,
  assignSchema,
  replaceSchema,
  logSchema,
} from "./program.schema";
const admin = (a: Principal) =>
  a.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
const versionInclude = {
  days: {
    orderBy: [{ weekNumber: "asc" as const }, { dayIndex: "asc" as const }],
    include: { exercises: { orderBy: { position: "asc" as const } } },
  },
};
@Injectable()
export class ProgramService {
  constructor(private readonly db: Db) {}
  async selectedExercises(query: unknown) {
    const dto = parse(z.object({ ids: z.array(uuid).max(1680) }), query);
    return this.db.exercise.findMany({ where: { id: { in: dto.ids } } });
  }
  async exercises(query: unknown) {
    const q = parse(listQuery, query),
      where = {
        archivedAt: q.archived === "true" ? { not: null } : null,
        OR: [
          { name: { contains: q.q, mode: "insensitive" as const } },
          { category: { contains: q.q, mode: "insensitive" as const } },
        ],
      };
    const [items, total] = await this.db.$transaction([
      this.db.exercise.findMany({
        where,
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { name: "asc" },
      }),
      this.db.exercise.count({ where }),
    ]);
    return { items, total };
  }
  async saveExercise(auth: Principal, body: unknown, id?: string) {
    if (id) parse(uuid, id);
    const dto = id
        ? parse(z.strictObject({ version, data: exerciseSchema }), body)
        : null,
      data = dto?.data ?? parse(exerciseSchema, body);
    return atomic(this.db, async (tx) => {
      let item;
      if (id) {
        changed(
          (
            await tx.exercise.updateMany({
              where: { id, version: dto!.version, archivedAt: null },
              data: { ...data, version: { increment: 1 } },
            })
          ).count,
        );
        item = await tx.exercise.findUniqueOrThrow({ where: { id } });
      } else item = await tx.exercise.create({ data });
      await audit(tx, auth.id, "EXERCISE_SAVED", "Exercise", item.id, {
        name: item.name,
      });
      return item;
    });
  }
  async archiveExercise(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(
      z.strictObject({ version, archived: z.boolean(), reason }),
      body,
    );
    return atomic(this.db, async (tx) => {
      changed(
        (
          await tx.exercise.updateMany({
            where: { id, version: dto.version },
            data: {
              archivedAt: dto.archived ? new Date() : null,
              version: { increment: 1 },
            },
          })
        ).count,
      );
      await audit(
        tx,
        auth.id,
        "EXERCISE_ARCHIVED",
        "Exercise",
        id,
        { archived: dto.archived },
        dto.reason,
      );
      return { message: "Упражнение обновлено" };
    });
  }
  author(auth: Principal, p: TrainingProgram) {
    if (!admin(auth) && auth.trainerId !== p.authorTrainerId)
      fail("NOT_FOUND", "Программа не найдена", 404);
  }
  async validateDraft(tx: Tx, draft: z.infer<typeof draftSchema>) {
    const ids = [
        ...new Set(
          draft.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
        ),
      ],
      exercises = await tx.exercise.findMany({
        where: { id: { in: ids }, archivedAt: null },
      });
    if (exercises.length !== ids.length)
      fail(
        "EXERCISE_ARCHIVED",
        "Некоторые упражнения недоступны. Обновите состав программы",
      );
    for (const e of draft.days.flatMap((d) => d.exercises)) {
      const source = exercises.find((x) => x.id === e.exerciseId)!;
      if (
        (source.metricType === "REPS" && e.reps === null) ||
        (source.metricType === "DURATION" && e.durationSeconds === null)
      )
        fail(
          "METRIC_MISMATCH",
          "Показатель упражнения не соответствует режиму",
          422,
        );
    }
    return exercises;
  }
  async list(auth: Principal, query: unknown) {
    auth = areaPrincipal(auth, parse(listQuery, query).area);
    const q = parse(listQuery, query),
      where = {
        ...(admin(auth)
          ? {}
          : {
              authorTrainerId:
                auth.trainerId ?? "00000000-0000-0000-0000-000000000000",
            }),
        archivedAt: q.archived === "true" ? { not: null } : null,
        title: { contains: q.q, mode: "insensitive" as const },
      };
    const [items, total] = await this.db.$transaction([
      this.db.trainingProgram.findMany({
        where,
        select: {
          id: true,
          title: true,
          version: true,
          archivedAt: true,
          updatedAt: true,
          author: { select: { user: { select: { name: true } } } },
          versions: {
            orderBy: { number: "desc" },
            take: 1,
            select: {
              id: true,
              number: true,
              weeks: true,
              level: true,
              publishedAt: true,
            },
          },
          _count: { select: { assignments: true } },
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { updatedAt: "desc" },
      }),
      this.db.trainingProgram.count({ where }),
    ]);
    return { items, total };
  }
  async detail(auth: Principal, id: string) {
    parse(uuid, id);
    const p = await this.db.trainingProgram.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, user: { select: { name: true } } } },
        versions: { orderBy: { number: "desc" }, include: versionInclude },
      },
    });
    if (!p) fail("NOT_FOUND", "Программа не найдена", 404);
    this.author(auth, p);
    return p;
  }
  async save(auth: Principal, body: unknown, id?: string) {
    if (id) parse(uuid, id);
    const update = id ? parse(updateProgram, body) : null,
      create = !id ? parse(createProgram, body) : null,
      draft = update?.draft ?? create!.draft;
    return atomic(this.db, async (tx) => {
      await this.validateDraft(tx, draft);
      let p;
      if (id) {
        const original = await tx.trainingProgram.findUnique({ where: { id } });
        if (!original) fail("NOT_FOUND", "Программа не найдена", 404);
        this.author(auth, original);
        changed(
          (
            await tx.trainingProgram.updateMany({
              where: { id, version: update!.version, archivedAt: null },
              data: { title: draft.title, draft, version: { increment: 1 } },
            })
          ).count,
        );
        p = await tx.trainingProgram.findUniqueOrThrow({ where: { id } });
      } else {
        const trainerId = admin(auth)
          ? create?.authorTrainerId
          : auth.trainerId;
        if (!trainerId)
          fail("TRAINER_REQUIRED", "Выберите автора программы", 400);
        const trainer = await tx.trainerProfile.findUnique({
          where: { id: trainerId },
        });
        if (!trainer || trainer.archivedAt || !trainer.active)
          fail("TRAINER_UNAVAILABLE", "Тренер недоступен");
        p = await tx.trainingProgram.create({
          data: { title: draft.title, draft, authorTrainerId: trainerId },
        });
      }
      await audit(tx, auth.id, "PROGRAM_DRAFT_SAVED", "TrainingProgram", p.id, {
        version: p.version,
      });
      return p;
    });
  }
  async publish(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(z.strictObject({ version }), body);
    return idempotent(
      this.db,
      auth.id,
      "program-publish:" + id,
      key,
      dto,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "TrainingProgram" WHERE id=${id}::uuid FOR UPDATE`;
        const p = await tx.trainingProgram.findUnique({
          where: { id },
          include: { versions: { orderBy: { number: "desc" }, take: 1 } },
        });
        if (!p) fail("NOT_FOUND", "Программа не найдена", 404);
        this.author(auth, p);
        if (p.archivedAt) fail("PROGRAM_ARCHIVED", "Программа в архиве");
        if (p.version !== dto.version)
          fail("VERSION_CONFLICT", "Черновик изменился. Обновите страницу");
        const draft = parse(draftSchema, p.draft),
          exercises = await this.validateDraft(tx, draft);
        const v = await tx.programVersion.create({
          data: {
            programId: id,
            number: (p.versions[0]?.number ?? 0) + 1,
            title: draft.title,
            goal: draft.goal,
            level: draft.level,
            weeks: draft.weeks,
            days: {
              create: draft.days.map((d) => ({
                weekNumber: d.weekNumber,
                dayIndex: d.dayIndex,
                title: d.title,
                exercises: {
                  create: d.exercises.map((e, position) => {
                    const source = exercises.find(
                      (x) => x.id === e.exerciseId,
                    )!;
                    return {
                      ...e,
                      position,
                      exerciseSnapshot: {
                        name: source.name,
                        category: source.category,
                        instructions: source.instructions,
                        metricType: source.metricType,
                        equipment: source.equipment,
                        imageUrl: source.imageUrl,
                      },
                    };
                  }),
                },
              })),
            },
          },
          include: versionInclude,
        });
        await tx.trainingProgram.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await audit(tx, auth.id, "PROGRAM_PUBLISHED", "ProgramVersion", v.id, {
          number: v.number,
          programId: id,
        });
        return v;
      },
    );
  }
  async archive(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(
      z.strictObject({ version, archived: z.boolean(), reason }),
      body,
    );
    return atomic(this.db, async (tx) => {
      const p = await tx.trainingProgram.findUnique({ where: { id } });
      if (!p) fail("NOT_FOUND", "Программа не найдена", 404);
      this.author(auth, p);
      changed(
        (
          await tx.trainingProgram.updateMany({
            where: { id, version: dto.version },
            data: {
              archivedAt: dto.archived ? new Date() : null,
              version: { increment: 1 },
            },
          })
        ).count,
      );
      await audit(
        tx,
        auth.id,
        "PROGRAM_ARCHIVED",
        "TrainingProgram",
        id,
        { archived: dto.archived },
        dto.reason,
      );
      return { message: "Программа обновлена" };
    });
  }
  async assignmentScope(tx: Tx, auth: Principal, a: ProgramAssignment) {
    if (admin(auth) || auth.clientId === a.clientId) return;
    if (
      auth.trainerId !== a.trainerId ||
      !(await tx.trainerClient.findUnique({
        where: {
          trainerId_clientId: { trainerId: a.trainerId, clientId: a.clientId },
        },
      }))
    )
      fail("NOT_FOUND", "Назначение не найдено", 404);
  }
  async notify(tx: Tx, a: ProgramAssignment, title: string) {
    const c = await tx.clientProfile.findUnique({
      where: { id: a.clientId },
      include: { user: true },
    });
    if (!c?.userId || !c.user) return;
    const v = await tx.programVersion.findUniqueOrThrow({
        where: { id: a.programVersionId },
      }),
      eventKey = "assignment:" + a.id + ":" + a.version;
    await tx.notification.create({
      data: {
        recipientId: c.userId,
        type: "PROGRAM",
        title,
        text: v.title,
        href: "/account/programs/" + a.id,
        eventKey,
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: "EMAIL",
        dedupKey: eventKey,
        payload: seal({
          to: c.user.email,
          subject: title + " · Страйд",
          text: v.title + "\nПрограмма доступна в вашем кабинете.",
        }),
      },
    });
  }
  async assignInTx(tx: Tx, auth: Principal, dto: z.infer<typeof assignSchema>) {
    const v = await tx.programVersion.findUnique({
      where: { id: dto.programVersionId },
      include: { program: true },
    });
    if (!v || v.program.archivedAt)
      fail("NOT_FOUND", "Опубликованная программа не найдена", 404);
    this.author(auth, v.program);
    const client = await tx.clientProfile.findUnique({
      where: { id: dto.clientId },
    });
    if (!client || client.archivedAt || client.status !== "ACTIVE")
      fail("CLIENT_UNAVAILABLE", "Клиент недоступен");
    const assigned = await tx.trainerClient.findUnique({
      where: {
        trainerId_clientId: {
          trainerId: v.program.authorTrainerId,
          clientId: client.id,
        },
      },
    });
    if (!assigned && !admin(auth))
      fail(
        "CLIENT_SCOPE",
        "Программу можно назначить только своему клиенту",
        403,
      );
    if (!assigned)
      await tx.trainerClient.create({
        data: { trainerId: v.program.authorTrainerId, clientId: client.id },
      });
    const startsOn = midnight(dto.startsOn),
      now = midnight(clubDay());
    if (startsOn < now || startsOn.getTime() > now.getTime() + 365 * DAY)
      fail("PROGRAM_START", "Выберите дату начала в ближайший год", 422);
    return tx.programAssignment.create({
      data: {
        programId: v.programId,
        programVersionId: v.id,
        clientId: client.id,
        trainerId: v.program.authorTrainerId,
        startsOn,
      },
    });
  }
  async assign(auth: Principal, body: unknown, key?: string) {
    const dto = parse(assignSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "program-assign",
      key,
      dto,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ClientProfile" WHERE id=${dto.clientId}::uuid FOR UPDATE`;
        const a = await this.assignInTx(tx, auth, dto);
        await this.notify(tx, a, "Тренер назначил программу");
        await audit(
          tx,
          auth.id,
          "PROGRAM_ASSIGNED",
          "ProgramAssignment",
          a.id,
          { clientId: a.clientId, programVersionId: a.programVersionId },
        );
        return a;
      },
    );
  }
  async assignments(auth: Principal, query: unknown) {
    auth = areaPrincipal(auth, parse(listQuery, query).area);
    const q = parse(
      listQuery.extend({
        clientId: uuid.optional(),
        programId: uuid.optional(),
        status: z
          .enum(["ACTIVE", "COMPLETED", "REPLACED", "CANCELLED"])
          .optional(),
      }),
      query,
    );
    const where = {
      ...(admin(auth)
        ? { clientId: q.clientId }
        : auth.trainerId
          ? {
              trainerId: auth.trainerId,
              client: { trainers: { some: { trainerId: auth.trainerId } } },
            }
          : {
              clientId: auth.clientId ?? "00000000-0000-0000-0000-000000000000",
            }),
      programId: q.programId,
      status: q.status,
    };
    const [items, total] = await this.db.$transaction([
      this.db.programAssignment.findMany({
        where,
        include: {
          client: { select: { name: true } },
          trainer: { select: { user: { select: { name: true } } } },
          programVersion: {
            select: {
              title: true,
              number: true,
              weeks: true,
              goal: true,
              _count: { select: { days: true } },
            },
          },
          _count: {
            select: { logs: { where: { completedAt: { not: null } } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.programAssignment.count({ where }),
    ]);
    return { items, total };
  }
  async assignment(auth: Principal, id: string) {
    parse(uuid, id);
    return atomic(this.db, async (tx) => {
      const a = await tx.programAssignment.findUnique({
        where: { id },
        include: {
          client: { select: { name: true } },
          trainer: { select: { user: { select: { name: true } } } },
          programVersion: { include: versionInclude },
          logs: {
            include: {
              sets: true,
              revisions: { orderBy: { version: "desc" } },
            },
          },
          comments: {
            where:
              !admin(auth) && auth.clientId ? { visibility: "SHARED" } : {},
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!a) fail("NOT_FOUND", "Назначение не найдено", 404);
      await this.assignmentScope(tx, auth, a);
      return a;
    });
  }
  async replace(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(replaceSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "assignment-replace:" + id,
      key,
      dto,
      async (tx) => {
        const original = await tx.programAssignment.findUnique({
          where: { id },
        });
        if (!original) fail("NOT_FOUND", "Назначение не найдено", 404);
        await this.assignmentScope(tx, auth, original);
        await tx.$queryRaw`SELECT id FROM "ClientProfile" WHERE id=${original.clientId}::uuid FOR UPDATE`;
        const target = await tx.programVersion.findUnique({
          where: { id: dto.programVersionId },
        });
        if (!target || target.programId !== original.programId)
          fail("PROGRAM_VERSION", "Выберите версию этой программы");
        changed(
          (
            await tx.programAssignment.updateMany({
              where: { id, version: dto.version, status: "ACTIVE" },
              data: { status: "REPLACED", version: { increment: 1 } },
            })
          ).count,
        );
        const replacement = await this.assignInTx(tx, auth, {
          programVersionId: dto.programVersionId,
          clientId: original.clientId,
          startsOn: dto.startsOn,
        });
        await tx.programAssignment.update({
          where: { id },
          data: { replacedById: replacement.id },
        });
        await this.notify(tx, replacement, "Программа обновлена тренером");
        await audit(
          tx,
          auth.id,
          "PROGRAM_VERSION_REPLACED",
          "ProgramAssignment",
          id,
          { replacementId: replacement.id },
          dto.reason,
        );
        return replacement;
      },
    );
  }
  async stop(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(z.strictObject({ version, reason }), body);
    return idempotent(
      this.db,
      auth.id,
      "assignment-stop:" + id,
      key,
      dto,
      async (tx) => {
        const a = await tx.programAssignment.findUnique({ where: { id } });
        if (!a) fail("NOT_FOUND", "Назначение не найдено", 404);
        await this.assignmentScope(tx, auth, a);
        changed(
          (
            await tx.programAssignment.updateMany({
              where: { id, version: dto.version, status: "ACTIVE" },
              data: { status: "CANCELLED", version: { increment: 1 } },
            })
          ).count,
        );
        const next = await tx.programAssignment.findUniqueOrThrow({
          where: { id },
        });
        await this.notify(tx, next, "Программа завершена тренером");
        await audit(
          tx,
          auth.id,
          "PROGRAM_STOPPED",
          "ProgramAssignment",
          id,
          {},
          dto.reason,
        );
        return next;
      },
    );
  }
  async saveLog(
    auth: Principal,
    id: string,
    dayId: string,
    body: unknown,
    key?: string,
  ) {
    parse(uuid, id);
    parse(uuid, dayId);
    const dto = parse(logSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "program-log:" + id + ":" + dayId,
      key,
      dto,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ProgramAssignment" WHERE id=${id}::uuid FOR UPDATE`;
        const a = await tx.programAssignment.findUnique({ where: { id } });
        if (!a || a.clientId !== auth.clientId)
          fail("NOT_FOUND", "Назначение не найдено", 404);
        if (a.status !== "ACTIVE")
          fail("ASSIGNMENT_FINISHED", "Эта программа уже завершена");
        const day = await tx.programDay.findUnique({
          where: { id: dayId },
          include: { exercises: true },
        });
        if (!day || day.programVersionId !== a.programVersionId)
          fail("NOT_FOUND", "День программы не найден", 404);
        const performedOn = midnight(dto.performedOn);
        if (performedOn < a.startsOn || performedOn > midnight(clubDay()))
          fail(
            "PERFORMED_DATE",
            "Укажите фактическую дату выполнения в пределах начавшейся программы",
          );
        const seen = new Set<string>();
        for (const set of dto.sets) {
          const e = day.exercises.find((e) => e.id === set.programExerciseId);
          if (!e || set.setIndex > e.sets)
            fail("SET_SCOPE", "Подход не принадлежит этому дню программы", 422);
          if (seen.has(e.id + ":" + set.setIndex))
            fail("SET_DUPLICATE", "Подход указан дважды", 422);
          seen.add(e.id + ":" + set.setIndex);
          if (
            (e.reps !== null &&
              (set.actualReps === null || set.actualSeconds !== null)) ||
            (e.durationSeconds !== null &&
              (set.actualSeconds === null || set.actualReps !== null))
          )
            fail(
              "METRIC_MISMATCH",
              "Заполните подходящий показатель упражнения",
              422,
            );
        }
        if (
          dto.completed &&
          dto.sets.length !== day.exercises.reduce((n, e) => n + e.sets, 0)
        )
          fail(
            "SETS_INCOMPLETE",
            "Для завершения дня заполните все подходы",
            422,
          );
        const old = await tx.programDayLog.findUnique({
          where: { assignmentId_dayId: { assignmentId: id, dayId } },
        });
        if ((old?.version ?? 0) !== dto.version)
          fail("VERSION_CONFLICT", "Журнал изменился в другой вкладке");
        const log = old
          ? await tx.programDayLog.update({
              where: { id: old.id },
              data: {
                performedOn,
                completedAt: dto.completed ? new Date() : null,
                comment: dto.comment,
                version: { increment: 1 },
              },
            })
          : await tx.programDayLog.create({
              data: {
                assignmentId: id,
                dayId,
                performedOn,
                completedAt: dto.completed ? new Date() : null,
                comment: dto.comment,
              },
            });
        await tx.exerciseSetLog.deleteMany({ where: { dayLogId: log.id } });
        await tx.exerciseSetLog.createMany({
          data: dto.sets.map((s) => ({ ...s, dayLogId: log.id })),
        });
        await tx.programLogRevision.create({
          data: {
            dayLogId: log.id,
            version: log.version,
            snapshot: dto as Prisma.InputJsonValue,
          },
        });
        const total = await tx.programDay.count({
            where: { programVersionId: a.programVersionId },
          }),
          done = await tx.programDayLog.count({
            where: { assignmentId: id, completedAt: { not: null } },
          });
        await tx.programAssignment.update({
          where: { id },
          data: {
            version: { increment: 1 },
            ...(done === total
              ? { status: "COMPLETED", completedAt: new Date() }
              : {}),
          },
        });
        await audit(
          tx,
          auth.id,
          "PROGRAM_DAY_LOGGED",
          "ProgramDayLog",
          log.id,
          { completed: dto.completed, version: log.version },
        );
        return tx.programDayLog.findUniqueOrThrow({
          where: { id: log.id },
          include: { sets: true },
        });
      },
    );
  }
  async comment(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(
      z.strictObject({
        body: z.string().trim().min(1).max(2000),
        visibility: z.enum(["SHARED", "TEAM"]).default("SHARED"),
      }),
      body,
    );
    return idempotent(
      this.db,
      auth.id,
      "program-comment:" + id,
      key,
      dto,
      async (tx) => {
        const a = await tx.programAssignment.findUnique({ where: { id } });
        if (!a) fail("NOT_FOUND", "Назначение не найдено", 404);
        await this.assignmentScope(tx, auth, a);
        if (
          auth.clientId === a.clientId &&
          !admin(auth) &&
          dto.visibility !== "SHARED"
        )
          fail(
            "COMMENT_VISIBILITY",
            "Клиентские комментарии видны тренеру",
            403,
          );
        const c = await tx.programComment.create({
          data: {
            assignmentId: id,
            authorId: auth.id,
            authorName: auth.name,
            ...dto,
          },
        });
        await audit(
          tx,
          auth.id,
          "PROGRAM_COMMENT_ADDED",
          "ProgramAssignment",
          id,
          { visibility: dto.visibility },
        );
        return c;
      },
    );
  }
}
