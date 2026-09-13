import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../db";
import { parse, listQuery, uuid } from "../../common/validation";
import { atomic, type Tx } from "../../common/transaction";
import { seal } from "../../common/crypto";
import type { Principal } from "../auth/access";
import { fail } from "../../common/business-error";
export const preferences = z.object({
  bookingEmail: z.boolean().default(true),
  programEmail: z.boolean().default(true),
  paymentEmail: z.boolean().default(true),
  reminderEmail: z.boolean().default(true),
  reminders: z.boolean().default(true),
});
export async function notifyUser(
  tx: Tx,
  userId: string,
  data: {
    type: "BOOKING" | "PROGRAM" | "PAYMENT" | "REMINDER";
    title: string;
    text: string;
    href: string;
    eventKey: string;
  },
) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const pref = parse(preferences, user.notificationPreferences);
  await tx.notification.upsert({
    where: {
      recipientId_eventKey: { recipientId: userId, eventKey: data.eventKey },
    },
    create: { recipientId: userId, ...data },
    update: {},
  });
  const enabled = {
    BOOKING: pref.bookingEmail,
    PROGRAM: pref.programEmail,
    PAYMENT: pref.paymentEmail,
    REMINDER: pref.reminderEmail,
  }[data.type];
  if (enabled)
    await tx.outboxEvent.upsert({
      where: { dedupKey: data.eventKey },
      create: {
        type: "EMAIL",
        dedupKey: data.eventKey,
        payload: seal({
          to: user.email,
          subject: data.title + " · Страйд",
          text: data.text,
          recipientId: userId,
          category: data.type,
        }),
      },
      update: {},
    });
}
@Injectable()
export class NotificationService {
  constructor(private readonly db: Db) {}
  async list(auth: Principal, query: unknown) {
    const q = parse(
        listQuery.extend({ unread: z.enum(["true", "false"]).optional() }),
        query,
      ),
      where = {
        recipientId: auth.id,
        type: { not: "SUPPRESSED" },
        ...(q.unread === "true" ? { readAt: null } : {}),
      };
    const [items, total, unread] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({
        where: {
          recipientId: auth.id,
          readAt: null,
          type: { not: "SUPPRESSED" },
        },
      }),
    ]);
    return { items, total, unread };
  }
  async read(auth: Principal, id?: string) {
    if (id) parse(uuid, id);
    const r = await this.db.notification.updateMany({
      where: { recipientId: auth.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }
  async getPreferences(auth: Principal) {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: auth.id } });
    return parse(preferences, u.notificationPreferences);
  }
  async savePreferences(auth: Principal, body: unknown) {
    const dto = parse(preferences.strict(), body);
    await this.db.user.update({
      where: { id: auth.id },
      data: { notificationPreferences: dto },
    });
    return dto;
  }
  async tick(now = new Date()) {
    for (const hours of [24, 2]) {
      const rows = await this.db.$queryRaw<
        { id: string }[]
      >`SELECT b.id FROM "Booking" b JOIN "ScheduledSession" s ON s.id=b."sessionId" JOIN "ClientProfile" c ON c.id=b."clientId" WHERE b.status='CONFIRMED' AND s.status='PUBLISHED' AND c."userId" IS NOT NULL AND s."startAt">${new Date(now.getTime() + (hours === 24 ? 2 : 0) * 3600000)} AND s."startAt"<=${new Date(now.getTime() + hours * 3600000)} AND b."createdAt"<=s."startAt"-(${hours}*INTERVAL '1 hour') AND NOT EXISTS(SELECT 1 FROM "Notification" n WHERE n."recipientId"=c."userId" AND n."eventKey"='reminder:'||b.id::text||':'||s."startAt"::text||':'||${String(hours)}) ORDER BY s."startAt" LIMIT 100`;
      for (const row of rows)
        await atomic(this.db, async (tx) => {
          const b = await tx.booking.findUnique({
            where: { id: row.id },
            include: {
              client: { include: { user: true } },
              session: { include: { workout: true } },
            },
          });
          if (
            !b ||
            b.status !== "CONFIRMED" ||
            b.session.status !== "PUBLISHED" ||
            b.session.startAt <= now ||
            !b.client.userId
          )
            return;
          const due = new Date(b.session.startAt.getTime() - hours * 3600000);
          if (b.createdAt > due || due > now) return;
          if (
            hours === 24 &&
            b.session.startAt.getTime() <= now.getTime() + 2 * 3600000
          )
            return;
          const stamp = await tx.$queryRaw<
            { stamp: string }[]
          >`SELECT "startAt"::text AS stamp FROM "ScheduledSession" WHERE id=${b.sessionId}::uuid`;
          const eventKey =
            "reminder:" + b.id + ":" + stamp[0]!.stamp + ":" + hours;
          const p = parse(
            preferences,
            b.client.user?.notificationPreferences ?? {},
          );
          if (!p.reminders) {
            await tx.notification.upsert({
              where: {
                recipientId_eventKey: {
                  recipientId: b.client.userId,
                  eventKey,
                },
              },
              create: {
                recipientId: b.client.userId,
                eventKey,
                type: "SUPPRESSED",
                title: "",
                text: "",
                href: "/account",
                readAt: now,
              },
              update: {},
            });
            return;
          }
          await notifyUser(tx, b.client.userId, {
            type: "REMINDER",
            title:
              hours === 24
                ? "Завтра у вас тренировка"
                : "Скоро начинается тренировка",
            text:
              b.session.workout.name +
              " · " +
              new Intl.DateTimeFormat("ru-RU", {
                timeZone: "Europe/Moscow",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(b.session.startAt),
            href: "/account/bookings/" + b.id,
            eventKey,
          });
        });
    }
    const memberships = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT m.id FROM "Membership" m JOIN "ClientProfile" c ON c.id=m."clientId" WHERE m."cancelledAt" IS NULL AND m."endAt">${now} AND m."endAt"<=${new Date(now.getTime() + 3 * 86400000)} AND c."userId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Notification" n WHERE n."recipientId"=c."userId" AND n."eventKey"='expiry:'||m.id::text||':'||m."endAt"::text) ORDER BY m."endAt" LIMIT 100`;
    for (const row of memberships)
      await atomic(this.db, async (tx) => {
        const m = await tx.membership.findUnique({
          where: { id: row.id },
          include: { client: { include: { user: true } } },
        });
        if (!m || m.cancelledAt || m.endAt <= now || !m.client.userId) return;
        const stamp = await tx.$queryRaw<
          { stamp: string }[]
        >`SELECT "endAt"::text AS stamp FROM "Membership" WHERE id=${m.id}::uuid`;
        const eventKey = "expiry:" + m.id + ":" + stamp[0]!.stamp;
        const p = parse(
          preferences,
          m.client.user?.notificationPreferences ?? {},
        );
        if (!p.reminders) {
          await tx.notification.upsert({
            where: {
              recipientId_eventKey: { recipientId: m.client.userId, eventKey },
            },
            create: {
              recipientId: m.client.userId,
              eventKey,
              type: "SUPPRESSED",
              title: "",
              text: "",
              href: "/account",
              readAt: now,
            },
            update: {},
          });
          return;
        }
        await notifyUser(tx, m.client.userId, {
          type: "REMINDER",
          title: "Абонемент скоро заканчивается",
          text:
            "Срок действия до " +
            new Intl.DateTimeFormat("ru-RU", {
              timeZone: "Europe/Moscow",
              dateStyle: "long",
            }).format(new Date(m.endAt.getTime() - 1)),
          href: "/account/memberships/" + m.id,
          eventKey,
        });
      });
  }
  async retry(auth: Principal, id: string) {
    parse(uuid, id);
    const r = await this.db.outboxEvent.updateMany({
      where: { id, status: "DEAD" },
      data: {
        status: "PENDING",
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
        lockedAt: null,
      },
    });
    if (!r.count) fail("EVENT_STATE", "Событие уже обработано или выполняется");
    await this.db.auditLog.create({
      data: {
        actorId: auth.id,
        action: "DELIVERY_RETRIED",
        entityType: "OutboxEvent",
        entityId: id,
      },
    });
    return { message: "Повторная доставка запланирована" };
  }
}
