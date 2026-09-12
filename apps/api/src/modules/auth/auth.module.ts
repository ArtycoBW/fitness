import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./access";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
@Module({
  providers: [AuthService, { provide: APP_GUARD, useClass: AccessGuard }],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
