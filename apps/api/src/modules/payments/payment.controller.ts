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
import { MembershipModule } from "../memberships/membership.controller";
import { PaymentService } from "./payment.service";
import { InternalPaymentProvider } from "./payment.provider";
@Roles("OWNER", "ADMIN", "RECEPTION", "CLIENT")
@Controller()
class PaymentController {
  constructor(private readonly service: PaymentService) {}
  @Post("orders") create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.createOrder(r.auth, b, r.header("Idempotency-Key"));
  }
  @Get("orders/:id") order(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.order(r.auth, id);
  }
  @Post("orders/:id/payment-attempts") attempt(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.attempt(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN", "RECEPTION")
  @Post("orders/:id/manual-payment")
  manual(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.attempt(
      r.auth,
      id,
      b,
      r.header("Idempotency-Key"),
      true,
    );
  }
  @Get("payments") list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.list(r.auth, q);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION")
  @Get("payments/confirmations/by-reference/:reference")
  reference(@Req() r: AuthRequest, @Param("reference") reference: string) {
    return this.service.byReference(r.auth, reference);
  }
  @Get("payments/:id") detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.detail(r.auth, id);
  }
  @Get("payments/:id/confirmation") confirmation(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.confirmation(r.auth, id);
  }
  @Roles("OWNER", "ADMIN") @Post("payments/:id/refund-preview") preview(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.previewRefund(r.auth, id, b);
  }
  @Roles("OWNER", "ADMIN") @Post("payments/:id/refunds") refund(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.createRefund(
      r.auth,
      id,
      b,
      r.header("Idempotency-Key"),
    );
  }
  @Get("refunds") refunds(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.refunds(r.auth, q);
  }
  @Get("refunds/:id") refundDetail(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.refund(r.auth, id);
  }
}
@Module({
  imports: [MembershipModule],
  controllers: [PaymentController],
  providers: [PaymentService, InternalPaymentProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
