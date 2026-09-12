import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { AuthRequest, Public, Roles } from "./access";
import { Db } from "../../db";
import { env } from "../../config";
import { fail } from "../../common/business-error";
import {
  AcceptInviteDto,
  BlockDto,
  EmailDto,
  InviteDto,
  LoginDto,
  PasswordDto,
  ProfileDto,
  RegisterDto,
  ResetDto,
  RolesDto,
  TokenDto,
} from "./auth.dto";
@Controller()
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly db: Db,
  ) {}
  @Public() @Post("auth/register") register(
    @Body() dto: RegisterDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.register(dto, req.ip ?? "unknown");
  }
  @Public() @Post("auth/login") async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.login(
      dto.email,
      dto.password,
      req.ip ?? "unknown",
    );
    const options = {
      secure: env.WEB_URL.startsWith("https:"),
      sameSite: "lax" as const,
      path: "/",
      expires: result.expiresAt,
    };
    res.cookie("fitness_session", result.raw, { ...options, httpOnly: true });
    res.cookie("fitness_csrf", result.csrf, options);
    return { message: "Вход выполнен" };
  }
  @Get("auth/me") me(@Req() req: AuthRequest) {
    return this.service.me(req.auth);
  }
  @Get("auth/csrf") csrf(@Req() req: AuthRequest) {
    return { csrfToken: req.cookies.fitness_csrf as string };
  }
  @Post("auth/logout") async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.authSession.update({
      where: { id: req.auth.sessionId },
      data: { revokedAt: new Date() },
    });
    res.clearCookie("fitness_session", { path: "/" });
    res.clearCookie("fitness_csrf", { path: "/" });
    return { message: "Вы вышли из аккаунта" };
  }
  @Post("auth/logout-all") async logoutAll(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.authSession.updateMany({
      where: { userId: req.auth.id },
      data: { revokedAt: new Date() },
    });
    res.clearCookie("fitness_session", { path: "/" });
    res.clearCookie("fitness_csrf", { path: "/" });
    return { message: "Все сессии завершены" };
  }
  @Get("auth/sessions") sessions(@Req() req: AuthRequest) {
    return this.db.authSession.findMany({
      where: {
        userId: req.auth.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
  }
  @Delete("auth/sessions/:id") async revoke(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    const result = await this.db.authSession.updateMany({
      where: { id, userId: req.auth.id },
      data: { revokedAt: new Date() },
    });
    if (!result.count) fail("NOT_FOUND", "Сессия не найдена", 404);
    return { message: "Сессия завершена" };
  }
  @Public() @Post("auth/verify-email") verify(@Body() dto: TokenDto) {
    return this.service.verifyEmail(dto.token);
  }
  @Post("auth/resend-verification") resend(@Req() req: AuthRequest) {
    return this.service.resend(req.auth);
  }
  @Public() @Post("auth/forgot-password") forgot(
    @Body() dto: EmailDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.forgot(dto.email, req.ip ?? "unknown");
  }
  @Public() @Post("auth/reset-password") reset(@Body() dto: ResetDto) {
    return this.service.reset(dto.token, dto.password);
  }
  @Patch("me") profile(@Body() dto: ProfileDto, @Req() req: AuthRequest) {
    return this.service.profile(req.auth, dto);
  }
  @Put("me/password") password(
    @Body() dto: PasswordDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.password(req.auth, dto.currentPassword, dto.password);
  }
  @Roles("OWNER", "ADMIN") @Post("staff/invitations") invite(
    @Body() dto: InviteDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.invite(req.auth, dto);
  }
  @Public() @Post("auth/accept-invite") accept(@Body() dto: AcceptInviteDto) {
    return this.service.acceptInvite(dto.token, dto.password);
  }
  @Roles("OWNER") @Put("users/:id/roles") roles(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RolesDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.setRoles(req.auth, id, dto);
  }
  @Roles("OWNER", "ADMIN") @Post("users/:id/block") block(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BlockDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.block(req.auth, id, dto.blocked, dto.reason);
  }
}
