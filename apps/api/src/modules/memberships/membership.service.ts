import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../db";
import { parse, uuid, listQuery, reason } from "../../common/validation";
import { atomic, audit, changed, type Tx } from "../../common/transaction";
import { idempotent } from "../../common/idempotency";
import { fail } from "../../common/business-error";
import type { Principal } from "../auth/access";
import {
  planSchema,
  planUpdate,
  termsSchema,
  type Terms,
  freezeSchema,
  freezeChange,
  adjustSchema,
  DAY,
  clubDay,
  midnight,
} from "./membership.schema";
import { EntitlementService } from "./entitlement.service";
@Injectable()
export class MembershipService {
  constructor(
    private readonly db: Db,
    private readonly rights: EntitlementService,
  ) {}
  async plans(publicOnly = false) {
    return this.db.membershipPlan.findMany({
      where: publicOnly ? { published: true, archivedAt: null } : {},
      orderBy: { name: "asc" },
      include: {
        versions: {
          orderBy: { number: "desc" },
          take: 1,
          include: {
            workouts: { select: { id: true, name: true } },
            trainers: {
              select: { id: true, user: { select: { name: true } } },
            },
            halls: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
  async savePlan(auth: Principal, body: unknown, id?: string) {
    if (id) parse(uuid, id);
    const envelope = id ? parse(planUpdate, body) : null;
    const dto = envelope ? envelope.data : parse(planSchema, body);
    return atomic(this.db, async (tx) => {
      const { terms } = dto;
      await this.validateReferences(tx, terms);
      let plan;
      if (id) {
        changed(
          (
            await tx.membershipPlan.updateMany({
              where: { id, version: envelope!.version, archivedAt: null },
              data: {
                name: terms.title,
                slug: dto.slug,
                published: dto.published,
                version: { increment: 1 },
              },
            })
          ).count,
        );
        plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id } });
      } else
        plan = await tx.membershipPlan.create({
          data: { name: terms.title, slug: dto.slug, published: dto.published },
        });
      const previous = await tx.membershipPlanVersion.aggregate({
        where: { planId: plan.id },
        _max: { number: true },
      });
      const { workoutIds, trainerIds, hallIds, ...attributes } = terms;
      const revision = await tx.membershipPlanVersion.create({
        data: {
          ...attributes,
          planId: plan.id,
          number: (previous._max.number ?? 0) + 1,
          workouts: { connect: workoutIds.map((id) => ({ id })) },
          trainers: { connect: trainerIds.map((id) => ({ id })) },
          halls: { connect: hallIds.map((id) => ({ id })) },
        },
      });
      await audit(
        tx,
        auth.id,
        "PLAN_VERSION_CREATED",
        "MembershipPlan",
        plan.id,
        { number: revision.number, priceMinor: terms.priceMinor },
      );
      return { ...plan, revision };
    });
  }
  async validateReferences(tx: Tx, terms: Terms) {
    const w = await tx.workoutType.count({
      where: { id: { in: terms.workoutIds }, archivedAt: null },
    });
    const t = await tx.trainerProfile.count({
      where: { id: { in: terms.trainerIds }, archivedAt: null, active: true },
    });
    const h = await tx.hall.count({
      where: { id: { in: terms.hallIds }, archivedAt: null },
    });
    if (
      w !== new Set(terms.workoutIds).size ||
      t !== new Set(terms.trainerIds).size ||
      h !== new Set(terms.hallIds).size
    )
      fail(
        "INVALID_RESOURCES",
        "В условиях есть недоступные направления, тренеры или залы",
        422,
      );
  }
  async archive(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(
      z.strictObject({
        version: z.number().int().positive(),
        archived: z.boolean(),
        reason,
      }),
      body,
    );
    return atomic(this.db, async (tx) => {
      changed(
        (
          await tx.membershipPlan.updateMany({
            where: { id, version: dto.version },
            data: {
              archivedAt: dto.archived ? new Date() : null,
              published: false,
              version: { increment: 1 },
            },
          })
        ).count,
      );
      await audit(
        tx,
        auth.id,
        "PLAN_ARCHIVED",
        "MembershipPlan",
        id,
        {},
        dto.reason,
      );
      return { message: "Тариф обновлён" };
    });
  }
  async snapshot(tx: Tx, versionId: string) {
    const v = await tx.membershipPlanVersion.findUnique({
      where: { id: versionId },
      include: {
        workouts: { select: { id: true } },
        trainers: { select: { id: true } },
        halls: { select: { id: true } },
        plan: true,
      },
    });
    if (!v) fail("NOT_FOUND", "Тариф не найден", 404);
    const terms = parse(termsSchema, {
      title: v.title,
      description: v.description,
      priceMinor: v.priceMinor,
      durationDays: v.durationDays,
      visitLimit: v.visitLimit,
      freezeQuotaDays: v.freezeQuotaDays,
      activationWindowDays: v.activationWindowDays,
      weekdays: v.weekdays,
      startMinute: v.startMinute,
      endMinute: v.endMinute,
      workoutIds: v.workouts.map((w) => w.id),
      trainerIds: v.trainers.map((t) => t.id),
      hallIds: v.halls.map((h) => h.id),
    });
    return { terms, plan: v.plan };
  }
  scope(auth: Principal, clientId: string) {
    if (
      !auth.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r)) &&
      auth.clientId !== clientId
    )
      fail("NOT_FOUND", "Абонемент не найден", 404);
  }
  async list(auth: Principal, query: unknown) {
    const q = parse(listQuery.extend({ clientId: uuid.optional() }), query);
    const staff = auth.roles.some((r) =>
      ["OWNER", "ADMIN", "RECEPTION"].includes(r),
    );
    const clientId = staff
      ? q.clientId
      : (auth.clientId ?? "00000000-0000-0000-0000-000000000000");
    const where = {
      ...(clientId ? { clientId } : {}),
      client: { name: { contains: q.q, mode: "insensitive" as const } },
    };
    const [items, total] = await this.db.$transaction([
      this.db.membership.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          freezes: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.membership.count({ where }),
    ]);
    return {
      items: items.map((m) => ({ ...m, status: this.rights.status(m) })),
      total,
    };
  }
  async detail(auth: Principal, id: string) {
    parse(uuid, id);
    const m = await this.db.membership.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        freezes: { orderBy: { startAt: "asc" } },
        ledger: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!m) fail("NOT_FOUND", "Абонемент не найден", 404);
    this.scope(auth, m.clientId);
    return { ...m, status: this.rights.status(m) };
  }
  async freeze(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(freezeSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "membership-freeze:" + id,
      key,
      dto,
      async (tx) => {
        const m = await this.rights.lock(tx, id);
        this.scope(auth, m.clientId);
        const terms = this.rights.terms(m);
        const startAt = midnight(dto.startDate),
          endAt = midnight(dto.endDate),
          days = Math.round((endAt.getTime() - startAt.getTime()) / DAY);
        if (
          m.cancelledAt ||
          days < 1 ||
          startAt < midnight(clubDay()) ||
          startAt < m.startAt ||
          startAt >= m.endAt ||
          endAt > m.endAt
        )
          fail(
            "FREEZE_DATES",
            "Выберите будущий период внутри срока абонемента",
            422,
          );
        if (
          m.freezes.some(
            (f) =>
              f.status === "ACTIVE" && f.startAt < endAt && f.endAt > startAt,
          )
        )
          fail("FREEZE_OVERLAP", "Период пересекается с другой заморозкой");
        const used = m.freezes
          .filter((f) => f.status === "ACTIVE")
          .reduce((sum, f) => sum + f.days, 0);
        if (used + days > terms.freezeQuotaDays)
          fail("FREEZE_QUOTA", "Недостаточно дней заморозки");
        const freeze = await tx.membershipFreeze.create({
          data: { membershipId: id, startAt, endAt, days, reason: dto.reason },
        });
        await tx.membership.update({
          where: { id },
          data: {
            endAt: new Date(m.endAt.getTime() + days * DAY),
            version: { increment: 1 },
          },
        });
        await audit(
          tx,
          auth.id,
          "MEMBERSHIP_FROZEN",
          "Membership",
          id,
          { days, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
          dto.reason,
        );
        return freeze;
      },
    );
  }
  async changeFreeze(
    auth: Principal,
    id: string,
    freezeId: string,
    body: unknown,
    key?: string,
  ) {
    parse(uuid, id);
    parse(uuid, freezeId);
    const dto = parse(freezeChange, body);
    return idempotent(
      this.db,
      auth.id,
      "freeze-change:" + freezeId,
      key,
      dto,
      async (tx) => {
        const m = await this.rights.lock(tx, id);
        this.scope(auth, m.clientId);
        const f = m.freezes.find((f) => f.id === freezeId);
        if (!f || f.status !== "ACTIVE")
          fail("NOT_FOUND", "Заморозка не найдена", 404);
        const now = midnight(clubDay());
        if (f.endAt <= now)
          fail("FREEZE_FINISHED", "Завершённую заморозку изменить нельзя");
        let days = 0;
        let endAt = f.startAt;
        if (dto.endDate) {
          endAt = midnight(dto.endDate);
          days = Math.round((endAt.getTime() - f.startAt.getTime()) / DAY);
          if (days < 1 || endAt > f.endAt || endAt < now)
            fail(
              "FREEZE_DATES",
              "Можно сократить только неиспользованные дни",
              422,
            );
        } else if (f.startAt < now)
          fail("FREEZE_STARTED", "Начавшуюся заморозку можно только сократить");
        await tx.membershipFreeze.update({
          where: { id: freezeId },
          data: { endAt, days, status: days ? "ACTIVE" : "CANCELLED" },
        });
        await tx.membership.update({
          where: { id },
          data: {
            endAt: new Date(m.endAt.getTime() - (f.days - days) * DAY),
            version: { increment: 1 },
          },
        });
        await audit(
          tx,
          auth.id,
          "FREEZE_CHANGED",
          "Membership",
          id,
          { freezeId, days },
          dto.reason,
        );
        return { message: days ? "Заморозка сокращена" : "Заморозка отменена" };
      },
    );
  }
  async adjust(auth: Principal, id: string, body: unknown, key?: string) {
    parse(uuid, id);
    const dto = parse(adjustSchema, body);
    return idempotent(
      this.db,
      auth.id,
      "membership-adjust:" + id,
      key,
      dto,
      async (tx) => {
        const m = await this.rights.lock(tx, id);
        if (m.cancelledAt || this.rights.terms(m).visitLimit === null)
          fail("ADJUST_UNAVAILABLE", "Корректировка недоступна");
        const updated = await this.rights.movement(
          tx,
          id,
          "ADJUST",
          "adjust:" + auth.id + ":" + key,
          auth.id,
          undefined,
          dto.delta,
          dto.reason,
        );
        await audit(
          tx,
          auth.id,
          "MEMBERSHIP_ADJUSTED",
          "Membership",
          id,
          { delta: dto.delta },
          dto.reason,
        );
        return updated;
      },
    );
  }
}
