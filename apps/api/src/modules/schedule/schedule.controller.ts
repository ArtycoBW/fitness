import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Query,
  Module,
} from "@nestjs/common";
import { AuthRequest, Public, Roles } from "../auth/access";
import { ScheduleService } from "./schedule.service";
import { ResourceModule } from "./resource.service";
import { BookingCoreModule } from "../bookings/booking-core.service";
@Controller()
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}
  @Roles("OWNER", "ADMIN") @Post("schedule/:id/cancel-preview") cancelPreview(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.cancel(r.auth, id, b, undefined, true);
  }
  @Public() @Get("public/schedule") publicList(@Query() q: unknown) {
    return this.service.list(q);
  }
  @Public() @Get("public/schedule/:id") publicDetail(@Param("id") id: string) {
    return this.service.detail(id);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER") @Get("schedule") list(
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.list(q, r.auth);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER", "CLIENT")
  @Get("schedule/:id")
  detail(@Param("id") id: string, @Req() r: AuthRequest) {
    return this.service.detail(id, r.auth);
  }
  @Roles("OWNER", "ADMIN") @Post("schedule") create(
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.create(r.auth, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN") @Post("schedule/preview") previewOne(
    @Body() b: unknown,
  ) {
    return this.service.previewOne(b);
  }
  @Roles("OWNER", "ADMIN") @Post("schedule/series/preview") preview(
    @Body() b: unknown,
  ) {
    return this.service.previewSeries(b);
  }
  @Roles("OWNER", "ADMIN") @Post("schedule/series") series(
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.createSeries(r.auth, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN") @Post("schedule/:id/preview") previewEdit(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.edit(r.auth, id, b, undefined, true);
  }
  @Roles("OWNER", "ADMIN") @Post("schedule/:id/edit") edit(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.edit(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN") @Post("schedule/:id/cancel") cancel(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.cancel(r.auth, id, b, r.header("Idempotency-Key"));
  }
}
@Module({
  imports: [ResourceModule, BookingCoreModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
