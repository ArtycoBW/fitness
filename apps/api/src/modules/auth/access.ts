import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Db } from "../../db";
import { digest } from "../../common/crypto";
import { fail } from "../../common/business-error";
import { env } from "../../config";
import type { Role } from "../../generated/prisma/enums";
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);
export interface Principal {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  roles: Role[];
  clientId: string | null;
  trainerId: string | null;
  sessionId: string;
}
export type AuthRequest = Request & { auth: Principal };
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly db: Db,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (mutating && req.headers.origin !== new URL(env.WEB_URL).origin)
      fail("ORIGIN_REJECTED", "Источник запроса не разрешён", 403);
    if (
      this.reflector.getAllAndOverride<boolean>("public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const raw: unknown = req.cookies?.fitness_session;
    if (typeof raw !== "string" || raw.length > 128)
      fail("UNAUTHENTICATED", "Войдите в аккаунт", 401);
    const session = await this.db.authSession.findUnique({
      where: { tokenHash: digest(raw) },
      include: {
        user: { include: { roles: true, client: true, trainer: true } },
      },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.lastSeenAt.getTime() < now.getTime() - 86400000 ||
      session.user.status !== "ACTIVE"
    )
      fail("SESSION_EXPIRED", "Сессия завершена. Войдите снова", 401);
    if (mutating) {
      const csrf = req.headers["x-csrf-token"];
      if (
        typeof csrf !== "string" ||
        csrf.length > 128 ||
        digest(csrf) !== session.csrfHash
      )
        fail("CSRF_REJECTED", "Обновите страницу и повторите действие", 403);
    }
    req.auth = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      verified: !!session.user.emailVerifiedAt,
      roles: session.user.roles.map((r) => r.role),
      clientId: session.user.client?.id ?? null,
      trainerId: session.user.trainer?.id ?? null,
      sessionId: session.id,
    };
    const allowed = this.reflector.getAllAndOverride<Role[]>("roles", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !req.auth.roles.some((r) => allowed.includes(r)))
      fail("FORBIDDEN", "Недостаточно прав", 403);
    if (now.getTime() - session.lastSeenAt.getTime() > 60000)
      await this.db.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    return true;
  }
}
