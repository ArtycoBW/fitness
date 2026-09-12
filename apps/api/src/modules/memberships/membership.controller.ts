import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Query,
  Module,
} from "@nestjs/common";
import { AuthRequest, Public, Roles } from "../auth/access";
import { MembershipService } from "./membership.service";
import { EntitlementService } from "./entitlement.service";
@Controller()
export class MembershipController {
  constructor(private readonly service: MembershipService) {}
  @Public() @Get("public/membership-plans") publicPlans() {
    return this.service.plans(true);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION") @Get("membership-plans") plans() {
    return this.service.plans();
  }
  @Roles("OWNER", "ADMIN") @Post("membership-plans") create(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.savePlan(r.auth, body);
  }
  @Roles("OWNER", "ADMIN") @Patch("membership-plans/:id") update(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.savePlan(r.auth, body, id);
  }
  @Roles("OWNER", "ADMIN") @Post("membership-plans/:id/archive") archive(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.archive(r.auth, id, body);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "CLIENT") @Get("memberships") list(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    return this.service.list(r.auth, q);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "CLIENT")
  @Get("memberships/:id")
  detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.detail(r.auth, id);
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "CLIENT")
  @Post("memberships/:id/freezes")
  freeze(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.freeze(r.auth, id, body, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN", "RECEPTION", "CLIENT")
  @Patch("memberships/:id/freezes/:freezeId")
  change(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Param("freezeId") freezeId: string,
    @Body() body: unknown,
  ) {
    return this.service.changeFreeze(
      r.auth,
      id,
      freezeId,
      body,
      r.header("Idempotency-Key"),
    );
  }
  @Roles("OWNER", "ADMIN") @Post("memberships/:id/adjustments") adjust(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.adjust(r.auth, id, body, r.header("Idempotency-Key"));
  }
}
@Module({
  controllers: [MembershipController],
  providers: [MembershipService, EntitlementService],
  exports: [MembershipService, EntitlementService],
})
export class MembershipModule {}
