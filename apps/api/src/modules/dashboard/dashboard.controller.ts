import { Controller, Get, Module, Param, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../db";
import { Roles, type AuthRequest } from "../auth/access";
import { parse, uuid, listQuery } from "../../common/validation";
import { areaPrincipal } from "../../common/area";
import { fail } from "../../common/business-error";
import { clubDay, midnight, DAY } from "../memberships/membership.schema";
import { EntitlementService } from "../memberships/entitlement.service";
const sessionInclude = {
  workout: { select: { name: true } },
  hall: { select: { name: true } },
  trainer: { select: { user: { select: { name: true } } } },
  _count: {
    select: {
      bookings: {
        where: { status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] } },
      },
    },
  },
};
@Controller()
class DashboardController {
  constructor(private readonly db: Db) {}
  @Get("dashboard") async overview(
    @Req() r: AuthRequest,
    @Query() query: unknown,
  ) {
    const q = parse(
        z.object({ area: z.enum(["admin", "trainer", "account"]) }),
        query,
      ),
      auth = areaPrincipal(r.auth, q.area),
      now = new Date(),
      start = midnight(clubDay()),
      end = new Date(start.getTime() + DAY);
    if (q.area === "account") {
      const [bookings, memberships, programs, attended] =
        await this.db.$transaction([
          this.db.booking.findMany({
            where: {
              clientId: auth.clientId!,
              status: { in: ["CONFIRMED", "WAITLISTED"] },
              session: { endAt: { gt: now } },
            },
            include: { session: { include: sessionInclude } },
            orderBy: { session: { startAt: "asc" } },
            take: 3,
          }),
          this.db.membership.findMany({
            where: {
              clientId: auth.clientId!,
              cancelledAt: null,
              endAt: { gt: now },
            },
            include: { freezes: true },
            orderBy: { endAt: "asc" },
            take: 4,
          }),
          this.db.programAssignment.findMany({
            where: { clientId: auth.clientId!, status: "ACTIVE" },
            include: {
              programVersion: {
                select: {
                  title: true,
                  weeks: true,
                  _count: { select: { days: true } },
                },
              },
              _count: {
                select: { logs: { where: { completedAt: { not: null } } } },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 3,
          }),
          this.db.booking.count({
            where: { clientId: auth.clientId!, status: "ATTENDED" },
          }),
        ]);
      const rights = new EntitlementService();
      return {
        area: q.area,
        bookings,
        memberships: memberships.map((m) => ({
          ...m,
          status: rights.status(m),
        })),
        programs,
        attended,
      };
    }
    const trainerId = q.area === "trainer" ? auth.trainerId! : undefined;
    const [sessions, clients, programs, unmarked] = await this.db.$transaction([
      this.db.scheduledSession.findMany({
        where: {
          trainerId,
          startAt: { gte: start, lt: end },
          status: "PUBLISHED",
        },
        include: sessionInclude,
        orderBy: { startAt: "asc" },
      }),
      this.db.clientProfile.count({
        where: {
          archivedAt: null,
          ...(trainerId ? { trainers: { some: { trainerId } } } : {}),
        },
      }),
      this.db.programAssignment.count({
        where: { trainerId, status: "ACTIVE" },
      }),
      this.db.booking.count({
        where: {
          status: "CONFIRMED",
          session: {
            trainerId,
            status: "PUBLISHED",
            startAt: { lte: new Date(now.getTime() + 900000) },
            endAt: { gte: new Date(now.getTime() - DAY) },
          },
        },
      }),
    ]);
    return { area: q.area, sessions, clients, programs, unmarked };
  }
  @Roles("OWNER", "ADMIN") @Get("users") async users(@Query() query: unknown) {
    const q = parse(
        listQuery.extend({
          role: z
            .enum(["OWNER", "ADMIN", "RECEPTION", "TRAINER", "CLIENT"])
            .optional(),
          status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
        }),
        query,
      ),
      where = {
        status: q.status,
        roles: q.role ? { some: { role: q.role } } : undefined,
        OR: [
          { name: { contains: q.q, mode: "insensitive" as const } },
          { email: { contains: q.q, mode: "insensitive" as const } },
        ],
      };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          roles: { select: { role: true } },
        },
        orderBy: { name: "asc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.user.count({ where }),
    ]);
    return { items, total };
  }
  @Roles("OWNER", "ADMIN") @Get("staff/invitations") async invitations() {
    return this.db.staffInvite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Roles("TRAINER") @Get("trainer/clients/:id") async client(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    if (
      !r.auth.trainerId ||
      !(await this.db.trainerClient.findUnique({
        where: {
          trainerId_clientId: { trainerId: r.auth.trainerId, clientId: id },
        },
      }))
    )
      fail("NOT_FOUND", "Клиент не найден", 404);
    return this.db.clientProfile.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        joinedAt: true,
        programAssignments: {
          where: { trainerId: r.auth.trainerId },
          select: {
            id: true,
            status: true,
            programVersion: { select: { title: true } },
            _count: {
              select: { logs: { where: { completedAt: { not: null } } } },
            },
          },
        },
        bookings: {
          where: { session: { trainerId: r.auth.trainerId } },
          select: {
            id: true,
            status: true,
            session: {
              select: { startAt: true, workout: { select: { name: true } } },
            },
          },
          orderBy: { session: { startAt: "desc" } },
          take: 20,
        },
      },
    });
  }
}
@Module({ controllers: [DashboardController] })
export class DashboardModule {}
