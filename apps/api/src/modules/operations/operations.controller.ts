import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { Roles, Public, type AuthRequest } from "../auth/access";
import { NotificationService } from "../notifications/notification.service";
import { OperationsService } from "./operations.service";
import { ReportService } from "./report.service";
import { ExportService } from "./export.service";
@Controller()
class NotificationController {
  constructor(private readonly s: NotificationService) {}
  @Get("notifications") list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.s.list(r.auth, q);
  }
  @Post("notifications/read-all") all(@Req() r: AuthRequest) {
    return this.s.read(r.auth);
  }
  @Post("notifications/:id/read") read(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.s.read(r.auth, id);
  }
  @Get("me/notification-preferences") preferences(@Req() r: AuthRequest) {
    return this.s.getPreferences(r.auth);
  }
  @Put("me/notification-preferences") update(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.s.savePreferences(r.auth, b);
  }
}
@Controller()
@Roles("OWNER", "ADMIN", "RECEPTION")
class OperationsController {
  constructor(
    private readonly s: OperationsService,
    private readonly n: NotificationService,
    private readonly reports: ReportService,
    private readonly exports: ExportService,
  ) {}
  @Public() @Post("public/leads") contact(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.s.contact(b, r.ip ?? "unknown", r.header("Idempotency-Key"));
  }
  @Public() @Get("public/club") async club() {
    const s = await this.s.settings();
    return { ...s.data, timezone: s.timezone, currency: s.currency };
  }
  @Get("leads") leads(@Query() q: unknown) {
    return this.s.leads(q);
  }
  @Get("leads/:id") lead(@Param("id") id: string) {
    return this.s.lead(id);
  }
  @Put("leads/:id") updateLead(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.updateLead(r.auth, id, b);
  }
  @Get("staff/options") staff() {
    return this.s.staff();
  }
  @Roles("OWNER", "ADMIN") @Get("settings") settings() {
    return this.s.settings();
  }
  @Roles("OWNER", "ADMIN") @Put("settings") updateSettings(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.s.saveSettings(r.auth, b);
  }
  @Roles("OWNER", "ADMIN") @Get("audit") audits(@Query() q: unknown) {
    return this.s.audits(q);
  }
  @Roles("OWNER", "ADMIN") @Get("deliveries") deliveries(@Query() q: unknown) {
    return this.s.deliveries(q);
  }
  @Roles("OWNER", "ADMIN") @Post("deliveries/:id/retry") retry(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.n.retry(r.auth, id);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER") @Get("reports") report(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    return this.reports.run(r.auth, q);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER") @Post("exports") export(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.exports.create(r.auth, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER") @Get("exports") exportsList(
    @Req() r: AuthRequest,
  ) {
    return this.exports.list(r.auth);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER")
  @Get("exports/:id/download")
  async download(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const bytes = await this.exports.download(r.auth, id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="report-${id}.csv"`,
    );
    res.send(bytes);
  }
}
@Module({
  controllers: [NotificationController, OperationsController],
  providers: [
    NotificationService,
    OperationsService,
    ReportService,
    ExportService,
  ],
  exports: [NotificationService, ReportService, ExportService],
})
export class OperationsModule {}
