import { Injectable } from "@nestjs/common";
import { hash, verify } from "argon2";
import { Prisma } from "../../generated/prisma/client";
import { Db } from "../../db";
import { token, digest, seal } from "../../common/crypto";
import { fail } from "../../common/business-error";
import { env } from "../../config";
import type { Principal } from "./access";
import type { RegisterDto, InviteDto, RolesDto, ProfileDto } from "./auth.dto";
const safeName = (name: string) => {
  const value = name.trim().replace(/[<>]/g, "");
  if (value.length < 2)
    fail("INVALID_NAME", "Укажите имя, минимум два символа", 422);
  return value;
};
const emailKey = (email: string) => email.trim().toLowerCase();
@Injectable()
export class AuthService {
  private readonly dummyHash = hash(token());
  constructor(private readonly db: Db) {}
  async rate(key: string, max = 5) {
    const window = new Date(Math.floor(Date.now() / 900000) * 900000);
    const bucket = await this.db.rateBucket.upsert({
      where: { key_window: { key: digest(key), window } },
      create: { key: digest(key), window, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (bucket.count > max)
      fail("RATE_LIMIT", "Слишком много попыток. Попробуйте позже", 429);
  }
  async queue(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
    purpose: "VERIFY" | "RESET",
    name: string,
  ) {
    const raw = token();
    await tx.oneTimeToken.create({
      data: {
        userId,
        purpose,
        tokenHash: digest(raw),
        expiresAt: new Date(
          Date.now() + (purpose === "RESET" ? 1800000 : 86400000),
        ),
      },
    });
    const path = purpose === "RESET" ? "/reset-password" : "/verify-email";
    await tx.outboxEvent.create({
      data: {
        type: "EMAIL",
        dedupKey: digest(raw),
        payload: seal({
          to: email,
          subject:
            purpose === "RESET"
              ? "Восстановление доступа"
              : "Подтвердите адрес",
          text:
            name +
            ",\n\n" +
            env.WEB_URL +
            path +
            "?token=" +
            raw +
            "\n\nЕсли это были не вы, пропустите письмо.",
        }),
      },
    });
  }
  async register(dto: RegisterDto, ip: string) {
    await this.rate("register:" + ip, 20);
    const email = emailKey(dto.email);
    const passwordHash = await hash(dto.password);
    try {
      await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: safeName(dto.name),
            roles: { create: { role: "CLIENT" } },
            client: { create: { name: safeName(dto.name) } },
          },
        });
        await tx.consentRecord.create({
          data: {
            userId: user.id,
            documentType: "TERMS_AND_PRIVACY",
            documentVersion: "1.0",
          },
        });
        await this.queue(tx, user.id, email, "VERIFY", user.name);
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        fail("EMAIL_EXISTS", "Этот адрес уже зарегистрирован", 409);
      throw e;
    }
    return {
      message: "Аккаунт создан. Подтвердите адрес по ссылке из письма.",
    };
  }
  async login(email: string, password: string, ip: string) {
    await this.rate("login:" + ip + ":" + emailKey(email), 10);
    await this.rate("login-ip:" + ip, 100);
    const user = await this.db.user.findUnique({
      where: { email: emailKey(email) },
    });
    const valid = await verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!user || !valid || user.status !== "ACTIVE")
      fail("INVALID_CREDENTIALS", "Неверный email или пароль", 401);
    const raw = token(),
      csrf = token();
    const session = await this.db.authSession.create({
      data: {
        userId: user.id,
        tokenHash: digest(raw),
        csrfHash: digest(csrf),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return { raw, csrf, expiresAt: session.expiresAt };
  }
  async me(auth: Principal) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: auth.id },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        avatarUrl: true,
        roles: { select: { role: true } },
        client: { select: { id: true, phone: true } },
        trainer: { select: { id: true } },
      },
    });
    return {
      ...user,
      roles: user.roles.map((r) => r.role),
      clientId: user.client?.id ?? null,
      trainerId: user.trainer?.id ?? null,
    };
  }
  async verifyEmail(raw: string) {
    await this.db.$transaction(async (tx) => {
      const found = await tx.oneTimeToken.findUnique({
        where: { tokenHash: digest(raw) },
      });
      if (
        !found ||
        found.purpose !== "VERIFY" ||
        found.consumedAt ||
        found.expiresAt < new Date()
      )
        fail("TOKEN_INVALID", "Ссылка недействительна или устарела", 422);
      const consumed = await tx.oneTimeToken.updateMany({
        where: { id: found.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        fail("TOKEN_INVALID", "Ссылка уже использована", 422);
      await tx.user.update({
        where: { id: found.userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
    return { message: "Адрес подтверждён. Можно войти в кабинет." };
  }
  async forgot(email: string, ip: string) {
    await this.rate("reset-ip:" + ip, 20);
    const user = await this.db.user.findUnique({
      where: { email: emailKey(email) },
    });
    if (user && user.status === "ACTIVE")
      await this.db.$transaction((tx) =>
        this.queue(tx, user.id, user.email, "RESET", user.name),
      );
    return {
      message:
        "Если аккаунт существует, письмо со ссылкой придёт на указанный адрес.",
    };
  }
  async reset(raw: string, password: string) {
    const passwordHash = await hash(password);
    await this.db.$transaction(async (tx) => {
      const found = await tx.oneTimeToken.findUnique({
        where: { tokenHash: digest(raw) },
      });
      if (
        !found ||
        found.purpose !== "RESET" ||
        found.consumedAt ||
        found.expiresAt < new Date()
      )
        fail("TOKEN_INVALID", "Ссылка недействительна или устарела", 422);
      const consumed = await tx.oneTimeToken.updateMany({
        where: { id: found.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        fail("TOKEN_INVALID", "Ссылка уже использована", 422);
      await tx.user.update({
        where: { id: found.userId },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: found.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.oneTimeToken.updateMany({
        where: { userId: found.userId, purpose: "RESET", consumedAt: null },
        data: { consumedAt: new Date() },
      });
    });
    return { message: "Пароль изменён. Войдите с новым паролем." };
  }
  async resend(auth: Principal) {
    await this.rate("verify:" + auth.id, 3);
    if (!auth.verified)
      await this.db.$transaction((tx) =>
        this.queue(tx, auth.id, auth.email, "VERIFY", auth.name),
      );
    return { message: "Письмо отправлено" };
  }
  async profile(auth: Principal, dto: ProfileDto) {
    await this.db.$transaction(async (tx) => {
      if (dto.name)
        await tx.user.update({
          where: { id: auth.id },
          data: { name: safeName(dto.name) },
        });
      if (auth.clientId)
        await tx.clientProfile.update({
          where: { id: auth.clientId },
          data: {
            ...(dto.name ? { name: safeName(dto.name) } : {}),
            ...(dto.phone ? { phone: dto.phone.replace(/[^+0-9]/g, "") } : {}),
          },
        });
    });
    return this.me(auth);
  }
  async password(auth: Principal, current: string, next: string) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: auth.id },
    });
    if (!(await verify(user.passwordHash, current)))
      fail("PASSWORD_MISMATCH", "Текущий пароль неверен", 422);
    const passwordHash = await hash(next);
    await this.db.$transaction([
      this.db.user.update({ where: { id: auth.id }, data: { passwordHash } }),
      this.db.authSession.updateMany({
        where: { userId: auth.id, id: { not: auth.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: "Пароль обновлён, остальные сессии завершены" };
  }
  async invite(auth: Principal, dto: InviteDto) {
    if (
      !dto.roles.length ||
      (dto.roles.includes("ADMIN") && !auth.roles.includes("OWNER"))
    )
      fail("FORBIDDEN", "Эту роль назначает руководитель", 403);
    if (
      await this.db.user.findUnique({ where: { email: emailKey(dto.email) } })
    )
      fail(
        "EMAIL_EXISTS",
        "Аккаунт уже существует. Измените роли в профиле сотрудника",
      );
    const raw = token();
    await this.db.$transaction(async (tx) => {
      await tx.staffInvite.create({
        data: {
          email: emailKey(dto.email),
          name: safeName(dto.name),
          roles: dto.roles,
          invitedBy: auth.id,
          tokenHash: digest(raw),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: "EMAIL",
          dedupKey: "invite:" + digest(raw),
          payload: seal({
            to: emailKey(dto.email),
            subject: "Приглашение в команду клуба",
            text: env.WEB_URL + "/accept-invite?token=" + raw,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: auth.id,
          action: "STAFF_INVITED",
          entityType: "User",
          entityId: emailKey(dto.email),
          changes: { roles: dto.roles },
        },
      });
    });
    return { message: "Приглашение отправлено" };
  }
  async acceptInvite(raw: string, password: string) {
    const passwordHash = await hash(password);
    await this.db.$transaction(async (tx) => {
      const invite = await tx.staffInvite.findUnique({
        where: { tokenHash: digest(raw) },
      });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
        fail("TOKEN_INVALID", "Приглашение недействительно", 422);
      const updated = await tx.staffInvite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (updated.count !== 1)
        fail("TOKEN_INVALID", "Приглашение уже использовано", 422);
      await tx.user.create({
        data: {
          email: invite.email,
          name: invite.name,
          passwordHash,
          emailVerifiedAt: new Date(),
          ...(invite.clientId
            ? {
                client: {
                  connect: {
                    id: invite.clientId,
                    AND: [{ userId: null }, { archivedAt: null }],
                  },
                },
              }
            : {}),
          roles: { create: invite.roles.map((role) => ({ role })) },
          ...(invite.roles.includes("TRAINER")
            ? {
                trainer: {
                  create: { slug: "trainer-" + token().slice(0, 10) },
                },
              }
            : {}),
        },
      });
    });
    return { message: "Приглашение принято. Войдите в аккаунт." };
  }
  async setRoles(auth: Principal, id: string, dto: RolesDto) {
    if (id === auth.id || !dto.roles.length)
      fail(
        "INVALID_ROLES",
        "Нельзя изменить свои роли или удалить все роли",
        422,
      );
    const target = await this.db.user.findUnique({
      where: { id },
      include: { roles: true },
    });
    if (!target || target.roles.some((r) => r.role === "OWNER"))
      fail("FORBIDDEN", "Изменение недоступно", 403);
    await this.db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (!dto.roles.includes("TRAINER")) {
        const trainer = await tx.trainerProfile.findUnique({
          where: { userId: id },
        });
        if (
          trainer &&
          ((await tx.programAssignment.count({
            where: { trainerId: trainer.id, status: "ACTIVE" },
          })) ||
            (await tx.scheduledSession.count({
              where: {
                trainerId: trainer.id,
                status: "PUBLISHED",
                endAt: { gt: new Date() },
              },
            })))
        )
          fail(
            "TRAINER_OBLIGATIONS",
            "Сначала завершите программы и перенесите будущие занятия тренера",
          );
      }
      await tx.userRole.createMany({
        data: [...new Set(dto.roles)].map((role) => ({ userId: id, role })),
      });
      if (dto.roles.includes("TRAINER"))
        await tx.trainerProfile.upsert({
          where: { userId: id },
          create: { userId: id, slug: "trainer-" + token().slice(0, 10) },
          update: {},
        });
      if (dto.roles.includes("CLIENT"))
        await tx.clientProfile.upsert({
          where: { userId: id },
          create: { userId: id, name: target.name },
          update: {},
        });
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: auth.id,
          action: "ROLES_CHANGED",
          entityType: "User",
          entityId: id,
          changes: { roles: dto.roles },
        },
      });
    });
    return { message: "Роли обновлены" };
  }
  async block(auth: Principal, id: string, blocked: boolean, reason: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      include: { roles: true },
    });
    if (
      !user ||
      id === auth.id ||
      user.roles.some((r) => r.role === "OWNER") ||
      (user.roles.some((r) => r.role === "ADMIN") &&
        !auth.roles.includes("OWNER"))
    )
      fail("FORBIDDEN", "Изменение недоступно", 403);
    await this.db.$transaction([
      this.db.user.update({
        where: { id },
        data: { status: blocked ? "BLOCKED" : "ACTIVE" },
      }),
      this.db.authSession.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      }),
      this.db.auditLog.create({
        data: {
          actorId: auth.id,
          action: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
          entityType: "User",
          entityId: id,
          reason,
        },
      }),
    ]);
    return {
      message: blocked ? "Аккаунт заблокирован" : "Доступ восстановлен",
    };
  }
}
