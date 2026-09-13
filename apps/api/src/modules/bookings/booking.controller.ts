import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Roles, type AuthRequest } from "../auth/access";
import { BookingCore, BookingCoreModule } from "./booking-core.service";
@Controller()
@Roles("OWNER", "ADMIN", "RECEPTION", "CLIENT")
class BookingController {
  constructor(private readonly service: BookingCore) {}
  @Post("bookings") book(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.book(r.auth, b, r.header("Idempotency-Key"));
  }
  @Get("sessions/:id/booking-options") options(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Query("clientId") clientId?: string,
  ) {
    return this.service.options(r.auth, id, clientId);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER", "CLIENT")
  @Get("bookings")
  list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.list(r.auth, q);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER", "CLIENT")
  @Get("bookings/:id")
  detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.detail(r.auth, id);
  }
  @Post("bookings/:id/cancel-preview") preview(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.cancelPreview(r.auth, id);
  }
  @Post("bookings/:id/cancel") cancel(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.cancel(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "TRAINER")
  @Post("bookings/:id/attendance")
  attendance(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.attendance(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN") @Post("bookings/:id/restore-visit") restore(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.restore(r.auth, id, b, r.header("Idempotency-Key"));
  }
}
@Module({ imports: [BookingCoreModule], controllers: [BookingController] })
export class BookingModule {}
