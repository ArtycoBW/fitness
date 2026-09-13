import { CatalogModule } from "./modules/catalog/catalog.controller";
import { MediaModule } from "./modules/catalog/media.controller";
import { MembershipModule } from "./modules/memberships/membership.controller";
import { ScheduleModule } from "./modules/schedule/schedule.controller";
import { PaymentModule } from "./modules/payments/payment.controller";
import { Controller, Get, Module } from "@nestjs/common";
import { Db } from "./db";
import { DatabaseModule } from "./common/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { Public } from "./modules/auth/access";
import { OutboxService } from "./modules/notifications/outbox.service";
@Public()
@Controller("health")
class HealthController {
  constructor(private readonly db: Db) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") async ready() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok", database: "connected" };
  }
}
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MembershipModule,
    PaymentModule,
    ScheduleModule,
    CatalogModule,
    MediaModule,
  ],
  providers: [OutboxService],
  controllers: [HealthController],
})
export class AppModule {}
