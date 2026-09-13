import { Injectable } from "@nestjs/common";
import { Db } from "../../db";
import { atomic, audit, changed } from "../../common/transaction";
import { fail } from "../../common/business-error";
import {
  parse,
  listQuery,
  period,
  reason,
  uuid,
} from "../../common/validation";
import { z } from "zod";
import {
  clientSchema,
  hallSchema,
  workoutSchema,
  trainerSchema,
  updateEnvelope,
  kindSchema,
} from "./catalog.schema";
import type { Principal } from "../auth/access";
import { token, digest, seal } from "../../common/crypto";
import { env } from "../../config";
import { ResourceService } from "../schedule/resource.service";
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: Db,
    private readonly resources: ResourceService,
  ) {}
  async list(kindRaw: string, query: unknown) {
    const kind = parse(kindSchema, kindRaw),
      q = parse(listQuery, query);
    const archivedAt = q.archived === "true" ? { not: null } : null;
    const page = { skip: (q.page - 1) * q.limit, take: q.limit };
    if (kind === "clients") {
      const where = {
        archivedAt,
        OR: [
          { name: { contains: q.q, mode: "insensitive" as const } },
          { phone: { contains: q.q } },
          { email: { contains: q.q, mode: "insensitive" as const } },
          { user: { email: { contains: q.q, mode: "insensitive" as const } } },
        ],
      };
      const [items, total] = await this.db.$transaction([
        this.db.clientProfile.findMany({
          where,
          ...page,
          orderBy: q.sort === "recent" ? { joinedAt: "desc" } : { name: "asc" },
          include: {
            user: { select: { email: true, status: true } },
            trainers: {
              include: {
                trainer: { include: { user: { select: { name: true } } } },
              },
            },
          },
        }),
        this.db.clientProfile.count({ where }),
      ]);
      return { items, total, page: q.page, limit: q.limit };
    }
    if (kind === "trainers") {
      const where = {
        archivedAt,
        user: { name: { contains: q.q, mode: "insensitive" as const } },
      };
      const [items, total] = await this.db.$transaction([
        this.db.trainerProfile.findMany({
          where,
          ...page,
          orderBy: { user: { name: "asc" } },
          include: {
            user: { select: { name: true, email: true, avatarUrl: true } },
            _count: { select: { clients: true } },
          },
        }),
        this.db.trainerProfile.count({ where }),
      ]);
      return {
        items: items.map((t) => ({ ...t, name: t.user.name })),
        total,
        page: q.page,
        limit: q.limit,
      };
    }
    if (kind === "halls") {
      const where = {
        archivedAt,
        name: { contains: q.q, mode: "insensitive" as const },
      };
      const [items, total] = await this.db.$transaction([
        this.db.hall.findMany({ where, ...page, orderBy: { name: "asc" } }),
        this.db.hall.count({ where }),
      ]);
      return { items, total, page: q.page, limit: q.limit };
    }
    const where = {
      archivedAt,
      name: { contains: q.q, mode: "insensitive" as const },
    };
    const [items, total] = await this.db.$transaction([
      this.db.workoutType.findMany({
        where,
        ...page,
        orderBy: { name: "asc" },
      }),
      this.db.workoutType.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async detail(kind: string, id: string) {
    parse(uuid, id);
    parse(kindSchema, kind);
    const item =
      kind === "clients"
        ? await this.db.clientProfile.findUnique({
            where: { id },
            include: {
              user: { select: { email: true, status: true } },
              notes: { orderBy: { createdAt: "desc" } },
              trainers: {
                include: {
                  trainer: { include: { user: { select: { name: true } } } },
                },
              },
            },
          })
        : kind === "trainers"
          ? await this.db.trainerProfile.findUnique({
              where: { id },
              include: {
                user: { select: { name: true, email: true, avatarUrl: true } },
                absences: { orderBy: { startAt: "asc" } },
                clients: { include: { client: true } },
              },
            })
          : kind === "halls"
            ? await this.db.hall.findUnique({
                where: { id },
                include: { closures: { orderBy: { startAt: "asc" } } },
              })
            : await this.db.workoutType.findUnique({ where: { id } });
    if (!item) fail("NOT_FOUND", "Запись не найдена", 404);
    return item;
  }
  async save(auth: Principal, kindRaw: string, body: unknown, id?: string) {
    const kind = parse(kindSchema, kindRaw);
    if (
      !auth.roles.some((r) => ["OWNER", "ADMIN"].includes(r)) &&
      kind !== "clients"
    )
      fail("FORBIDDEN", "Редактирование доступно администратору", 403);
    if (id) parse(uuid, id);
    const envelope = id ? parse(updateEnvelope, body) : null;
    const input = envelope ? envelope.data : body;
    return atomic(this.db, async (tx) => {
      let row: { id: string };
      if (kind === "clients") {
        const data = parse(clientSchema, input);
        if (data.phone) data.phone = data.phone.replace(/[^+0-9]/g, "");
        if (data.email) data.email = data.email.toLowerCase();
        if (id) {
          changed(
            (
              await tx.clientProfile.updateMany({
                where: { id, version: envelope!.version },
                data: { ...data, version: { increment: 1 } },
              })
            ).count,
          );
          row = await tx.clientProfile.findUniqueOrThrow({ where: { id } });
          const c = await tx.clientProfile.findUniqueOrThrow({ where: { id } });
          if (c.userId)
            await tx.user.update({
              where: { id: c.userId },
              data: { name: data.name },
            });
        } else row = await tx.clientProfile.create({ data });
      } else if (kind === "halls") {
        const data = parse(hallSchema, input);
        if (id) {
          changed(
            (
              await tx.hall.updateMany({
                where: { id, version: envelope!.version },
                data: { ...data, version: { increment: 1 } },
              })
            ).count,
          );
          row = await tx.hall.findUniqueOrThrow({ where: { id } });
        } else row = await tx.hall.create({ data });
      } else if (kind === "workouts") {
        const data = parse(workoutSchema, input);
        if (id) {
          changed(
            (
              await tx.workoutType.updateMany({
                where: { id, version: envelope!.version },
                data: { ...data, version: { increment: 1 } },
              })
            ).count,
          );
          row = await tx.workoutType.findUniqueOrThrow({ where: { id } });
        } else row = await tx.workoutType.create({ data });
      } else {
        if (!id)
          fail(
            "INVITE_REQUIRED",
            "Создайте тренера приглашением сотрудника",
            422,
          );
        const data = parse(trainerSchema, input);
        changed(
          (
            await tx.trainerProfile.updateMany({
              where: { id, version: envelope!.version },
              data: { ...data, version: { increment: 1 } },
            })
          ).count,
        );
        row = await tx.trainerProfile.findUniqueOrThrow({ where: { id } });
      }
      if (id) await this.resources.checkCatalogChange(tx, kind, id);
      await audit(tx, auth.id, id ? "UPDATED" : "CREATED", kind, row.id);
      return row;
    });
  }
  async archive(auth: Principal, kindRaw: string, id: string, body: unknown) {
    const kind = parse(kindSchema, kindRaw);
    parse(uuid, id);
    const data = parse(
      z.strictObject({
        version: z.number().int().positive(),
        archived: z.boolean(),
        reason,
      }),
      body,
    );
    if (!auth.roles.some((r) => ["OWNER", "ADMIN"].includes(r)))
      fail("FORBIDDEN", "Действие доступно администратору", 403);
    return atomic(this.db, async (tx) => {
      const where = { id, version: data.version };
      const update = {
        archivedAt: data.archived ? new Date() : null,
        version: { increment: 1 },
      };
      const result =
        kind === "clients"
          ? await tx.clientProfile.updateMany({ where, data: update })
          : kind === "trainers"
            ? await tx.trainerProfile.updateMany({
                where,
                data: {
                  ...update,
                  ...(data.archived ? { active: false, published: false } : {}),
                },
              })
            : kind === "halls"
              ? await tx.hall.updateMany({
                  where,
                  data: {
                    ...update,
                    ...(data.archived ? { published: false } : {}),
                  },
                })
              : await tx.workoutType.updateMany({
                  where,
                  data: {
                    ...update,
                    ...(data.archived ? { published: false } : {}),
                  },
                });
      changed(result.count);
      if (data.archived) await this.resources.checkCatalogChange(tx, kind, id);
      await audit(
        tx,
        auth.id,
        data.archived ? "ARCHIVED" : "RESTORED",
        kind,
        id,
        {},
        data.reason,
      );
      return {
        message: data.archived ? "Перенесено в архив" : "Восстановлено",
      };
    });
  }
  async note(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(
      z.strictObject({ text: z.string().trim().min(1).max(2000) }),
      body,
    );
    return atomic(this.db, async (tx) => {
      const note = await tx.clientNote.create({
        data: { clientId: id, actorId: auth.id, text: dto.text },
      });
      await audit(tx, auth.id, "NOTE_ADDED", "clients", id);
      return note;
    });
  }
  async blockVisits(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(z.strictObject({ blocked: z.boolean(), reason }), body);
    return atomic(this.db, async (tx) => {
      const item = await tx.clientProfile.update({
        where: { id },
        data: { visitsBlocked: dto.blocked, version: { increment: 1 } },
      });
      await audit(
        tx,
        auth.id,
        "VISITS_ACCESS_CHANGED",
        "clients",
        id,
        { blocked: dto.blocked },
        dto.reason,
      );
      return item;
    });
  }
  async assign(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(
      z.strictObject({ trainerId: uuid, assigned: z.boolean() }),
      body,
    );
    return atomic(this.db, async (tx) => {
      if (dto.assigned) {
        const trainer = await tx.trainerProfile.findUnique({
          where: { id: dto.trainerId },
        });
        if (!trainer || !trainer.active || trainer.archivedAt)
          fail("TRAINER_UNAVAILABLE", "Тренер недоступен");
        await tx.trainerClient.upsert({
          where: {
            trainerId_clientId: { trainerId: dto.trainerId, clientId: id },
          },
          create: { trainerId: dto.trainerId, clientId: id },
          update: {},
        });
      } else
        await tx.trainerClient.deleteMany({
          where: { trainerId: dto.trainerId, clientId: id },
        });
      await audit(tx, auth.id, "TRAINER_ASSIGNED", "clients", id, dto);
      return { message: "Назначение обновлено" };
    });
  }
  async invitation(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(z.strictObject({ email: z.email() }), body);
    return atomic(this.db, async (tx) => {
      const client = await tx.clientProfile.findUnique({ where: { id } });
      if (!client || client.userId || client.archivedAt)
        fail(
          "CLIENT_LINKED",
          "У клиента уже есть аккаунт или карточка недоступна",
        );
      if (
        await tx.user.findUnique({ where: { email: dto.email.toLowerCase() } })
      )
        fail("EMAIL_EXISTS", "Этот email уже связан с аккаунтом");
      const raw = token();
      await tx.staffInvite.create({
        data: {
          clientId: id,
          email: dto.email.toLowerCase(),
          name: client.name,
          roles: ["CLIENT"],
          invitedBy: auth.id,
          tokenHash: digest(raw),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: "EMAIL",
          dedupKey: "client-invite:" + digest(raw),
          payload: seal({
            to: dto.email,
            subject: "Ваш личный кабинет в Страйд",
            text: env.WEB_URL + "/accept-invite?token=" + raw,
          }),
        },
      });
      await audit(tx, auth.id, "CLIENT_INVITED", "clients", id);
      return { message: "Приглашение отправлено" };
    });
  }
  async interval(auth: Principal, kind: string, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(period, body);
    const data = {
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      reason: dto.reason,
    };
    return atomic(this.db, async (tx) => {
      const result =
        kind === "halls"
          ? await tx.hallClosure.create({ data: { hallId: id, ...data } })
          : await tx.trainerAbsence.create({
              data: { trainerId: id, ...data },
            });
      await audit(tx, auth.id, "UNAVAILABLE", "" + kind, id, {}, dto.reason);
      if (kind === "halls")
        await tx.hallOccupancy.create({
          data: {
            hallId: id,
            closureId: result.id,
            startAt: data.startAt,
            endAt: data.endAt,
          },
        });
      else
        await tx.trainerOccupancy.create({
          data: {
            trainerId: id,
            absenceId: result.id,
            startAt: data.startAt,
            endAt: data.endAt,
          },
        });
      return result;
    });
  }
  async publicList(kind: string, slug?: string) {
    const where = {
      published: true,
      archivedAt: null,
      ...(slug ? { slug } : {}),
    };
    if (kind === "halls")
      return this.db.hall.findMany({ where, orderBy: { name: "asc" } });
    if (kind === "workouts")
      return this.db.workoutType.findMany({ where, orderBy: { name: "asc" } });
    if (kind === "trainers")
      return (
        await this.db.trainerProfile.findMany({
          where: { ...where, active: true },
          select: {
            id: true,
            slug: true,
            bio: true,
            specialties: true,
            user: { select: { name: true, avatarUrl: true } },
          },
        })
      ).map((t) => ({
        id: t.id,
        slug: t.slug,
        bio: t.bio,
        specialties: t.specialties,
        name: t.user.name,
        avatarUrl: t.user.avatarUrl,
      }));
    return fail("NOT_FOUND", "Раздел не найден", 404);
  }
  async ownClients(auth: Principal) {
    if (!auth.trainerId) fail("FORBIDDEN", "Профиль тренера не найден", 403);
    return this.db.clientProfile.findMany({
      where: {
        trainers: { some: { trainerId: auth.trainerId } },
        archivedAt: null,
      },
      select: { id: true, name: true, status: true },
    });
  }
  async ownAvailability(auth: Principal) {
    if (!auth.trainerId) fail("FORBIDDEN", "Профиль тренера не найден", 403);
    return this.db.trainerProfile.findUnique({
      where: { id: auth.trainerId },
      select: { workingHours: true, absences: { orderBy: { startAt: "asc" } } },
    });
  }
  async ownAbsence(auth: Principal, body: unknown) {
    if (!auth.trainerId) fail("FORBIDDEN", "Профиль тренера не найден", 403);
    return this.interval(auth, "trainers", auth.trainerId, body);
  }
  async cancelInterval(
    auth: Principal,
    kind: string,
    id: string,
    periodId: string,
    body: unknown,
  ) {
    parse(z.enum(["halls", "trainers"]), kind);
    parse(uuid, id);
    parse(uuid, periodId);
    const dto = parse(z.strictObject({ reason }), body);
    if (
      !auth.roles.some((r) => ["OWNER", "ADMIN"].includes(r)) &&
      (kind !== "trainers" || auth.trainerId !== id)
    )
      fail("FORBIDDEN", "Недостаточно прав", 403);
    return atomic(this.db, async (tx) => {
      const changed =
        kind === "halls"
          ? await tx.hallClosure.updateMany({
              where: { id: periodId, hallId: id, cancelledAt: null },
              data: { cancelledAt: new Date() },
            })
          : await tx.trainerAbsence.updateMany({
              where: { id: periodId, trainerId: id, cancelledAt: null },
              data: { cancelledAt: new Date() },
            });
      if (!changed.count)
        fail("NOT_FOUND", "Период не найден или уже отменён", 404);
      if (kind === "halls")
        await tx.hallOccupancy.updateMany({
          where: { closureId: periodId },
          data: { active: false },
        });
      else
        await tx.trainerOccupancy.updateMany({
          where: { absenceId: periodId },
          data: { active: false },
        });
      await audit(
        tx,
        auth.id,
        "AVAILABILITY_RESTORED",
        kind,
        id,
        { periodId },
        dto.reason,
      );
      return { message: "Период отменён" };
    });
  }
}
