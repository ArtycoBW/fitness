import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../db";
import { parse, uuid, listQuery } from "../../common/validation";
import { atomic, audit, changed } from "../../common/transaction";
import { fail } from "../../common/business-error";
import { idempotent } from "../../common/idempotency";
import { digest } from "../../common/crypto";
import { requestId } from "../../common/request-context";
import type { Principal } from "../auth/access";
import { contactSchema, leadUpdate, clubUpdate } from "./operations.schema";
import { policySchema } from "../schedule/schedule.schema";
@Injectable()
export class OperationsService {
  constructor(private readonly db: Db) {}
  async contact(body: unknown, ip: string, key?: string) {
    const dto = parse(contactSchema, body);
    if (dto.website) return { message: "Обращение принято" };
    const window = new Date(Math.floor(Date.now() / 900000) * 900000),
      bucket = await this.db.rateBucket.upsert({
        where: { key_window: { key: digest("contact:" + ip), window } },
        create: { key: digest("contact:" + ip), window, count: 1 },
        update: { count: { increment: 1 } },
      });
    if (bucket.count > 5)
      fail("RATE_LIMIT", "Слишком много обращений. Попробуйте позже", 429);
    const normalized = dto.phone.replace(/[^+\d]/g, "");
    return idempotent(
      this.db,
      "00000000-0000-0000-0000-000000000000",
      "contact",
      key,
      { ...dto, phone: normalized },
      async (tx) => {
        const l = await tx.lead.create({
          data: {
            name: dto.name,
            phone: normalized,
            email: dto.email,
            message: dto.message,
            events: { create: { status: "NEW", note: "Получено с сайта" } },
          },
        });
        await tx.auditLog.create({
          data: {
            action: "LEAD_RECEIVED",
            entityType: "Lead",
            entityId: l.id,
            requestId: requestId(),
          },
        });
        return { message: "Обращение принято. Команда клуба свяжется с вами." };
      },
    );
  }
  async leads(query: unknown) {
    const q = parse(
        listQuery.extend({
          status: z
            .enum(["NEW", "CONTACTED", "SCHEDULED", "WON", "CLOSED"])
            .optional(),
          assignedTo: uuid.optional(),
        }),
        query,
      ),
      where = {
        status: q.status,
        assignedTo: q.assignedTo,
        OR: [
          { name: { contains: q.q, mode: "insensitive" as const } },
          { phone: { contains: q.q } },
          { email: { contains: q.q, mode: "insensitive" as const } },
        ],
      };
    const [items, total] = await this.db.$transaction([
      this.db.lead.findMany({
        where,
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      this.db.lead.count({ where }),
    ]);
    return { items, total };
  }
  async lead(id: string) {
    parse(uuid, id);
    const l = await this.db.lead.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!l) fail("NOT_FOUND", "Обращение не найдено", 404);
    return l;
  }
  async updateLead(auth: Principal, id: string, body: unknown) {
    parse(uuid, id);
    const dto = parse(leadUpdate, body);
    return atomic(this.db, async (tx) => {
      if (
        dto.assignedTo &&
        !(await tx.user.findFirst({
          where: {
            id: dto.assignedTo,
            status: "ACTIVE",
            roles: { some: { role: { in: ["OWNER", "ADMIN", "RECEPTION"] } } },
          },
        }))
      )
        fail("ASSIGNEE_UNAVAILABLE", "Выберите действующего сотрудника");
      changed(
        (
          await tx.lead.updateMany({
            where: { id, version: dto.version },
            data: {
              status: dto.status,
              assignedTo: dto.assignedTo,
              version: { increment: 1 },
            },
          })
        ).count,
      );
      await tx.leadEvent.create({
        data: {
          leadId: id,
          actorId: auth.id,
          status: dto.status,
          note: dto.note,
        },
      });
      await audit(tx, auth.id, "LEAD_UPDATED", "Lead", id, {
        status: dto.status,
        assignedTo: dto.assignedTo,
      });
      return tx.lead.findUniqueOrThrow({
        where: { id },
        include: { events: { orderBy: { createdAt: "asc" } } },
      });
    });
  }
  async staff() {
    return this.db.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { in: ["OWNER", "ADMIN", "RECEPTION"] } } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
  async settings() {
    const c = await this.db.clubSettings.upsert({
        where: { id: "club" },
        create: {},
        update: {},
      }),
      s = c.settings as Record<string, unknown>;
    return {
      version: c.version,
      timezone: c.timezone,
      currency: c.currency,
      data: {
        name: c.name,
        address: s.address ?? "",
        phone: s.phone ?? "",
        email: s.email ?? "club@stride.local",
        hours: s.hours ?? "Ежедневно, 07:00–22:00",
        legalName: s.legalName ?? "",
        bookingPolicy: parse(policySchema, s.bookingPolicy ?? {}),
      },
    };
  }
  async saveSettings(auth: Principal, body: unknown) {
    const dto = parse(clubUpdate, body);
    return atomic(this.db, async (tx) => {
      const current = await tx.clubSettings.findUnique({
        where: { id: "club" },
      });
      if (!current) fail("VERSION_CONFLICT", "Обновите настройки");
      const { name, ...settings } = dto.data;
      changed(
        (
          await tx.clubSettings.updateMany({
            where: { id: "club", version: dto.version },
            data: {
              name,
              settings: {
                ...(current.settings as Record<string, unknown>),
                ...settings,
              },
              version: { increment: 1 },
            },
          })
        ).count,
      );
      await audit(
        tx,
        auth.id,
        "CLUB_SETTINGS_UPDATED",
        "ClubSettings",
        "club",
        { name, bookingPolicy: dto.data.bookingPolicy },
        dto.reason,
      );
      return {
        message:
          "Настройки сохранены. Новые правила применяются к новым занятиям.",
      };
    });
  }
  async audits(query: unknown) {
    const q = parse(
        listQuery.extend({
          entityType: z.string().max(100).optional(),
          entityId: z.string().max(100).optional(),
          actorId: uuid.optional(),
        }),
        query,
      ),
      where = {
        entityType: q.entityType,
        entityId: q.entityId,
        actorId: q.actorId,
        action: { contains: q.q, mode: "insensitive" as const },
      };
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.auditLog.count({ where }),
    ]);
    const users = await this.db.user.findMany({
      where: {
        id: { in: items.flatMap((i) => (i.actorId ? [i.actorId] : [])) },
      },
      select: { id: true, name: true },
    });
    return {
      items: items.map((i) => ({
        ...i,
        actorName: users.find((u) => u.id === i.actorId)?.name ?? "Система",
      })),
      total,
    };
  }
  async deliveries(query: unknown) {
    const q = parse(
        listQuery.extend({
          status: z.enum(["PENDING", "PROCESSING", "SENT", "DEAD"]).optional(),
        }),
        query,
      ),
      where = { status: q.status };
    const [items, total] = await this.db.$transaction([
      this.db.outboxEvent.findMany({
        where,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          availableAt: true,
          lastError: true,
          createdAt: true,
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      this.db.outboxEvent.count({ where }),
    ]);
    return { items, total };
  }
}
