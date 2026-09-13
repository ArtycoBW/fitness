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
} from "@nestjs/common";
import { Roles, type AuthRequest } from "../auth/access";
import { ProgramService } from "./program.service";
@Controller()
@Roles("OWNER", "ADMIN", "TRAINER")
class ProgramController {
  constructor(private readonly s: ProgramService) {}
  @Post("exercises/selection") selectedExercises(@Body() q: unknown) {
    return this.s.selectedExercises(q);
  }
  @Get("exercises") exercises(@Query() q: unknown) {
    return this.s.exercises(q);
  }
  @Post("exercises") exercise(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.s.saveExercise(r.auth, b);
  }
  @Put("exercises/:id") updateExercise(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveExercise(r.auth, b, id);
  }
  @Roles("OWNER", "ADMIN") @Post("exercises/:id/archive") archiveExercise(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.archiveExercise(r.auth, id, b);
  }
  @Get("programs") list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.s.list(r.auth, q);
  }
  @Get("programs/:id") detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.s.detail(r.auth, id);
  }
  @Post("programs") create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.s.save(r.auth, b);
  }
  @Put("programs/:id") update(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.save(r.auth, b, id);
  }
  @Post("programs/:id/publish") publish(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.publish(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Post("programs/:id/archive") archive(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.archive(r.auth, id, b);
  }
  @Post("program-assignments") assign(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.s.assign(r.auth, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN", "TRAINER", "CLIENT")
  @Get("program-assignments")
  assignments(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.s.assignments(r.auth, q);
  }
  @Roles("OWNER", "ADMIN", "TRAINER", "CLIENT")
  @Get("program-assignments/:id")
  assignment(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.s.assignment(r.auth, id);
  }
  @Post("program-assignments/:id/replace") replace(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.replace(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Post("program-assignments/:id/stop") stop(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.stop(r.auth, id, b, r.header("Idempotency-Key"));
  }
  @Roles("CLIENT") @Put("program-assignments/:id/days/:dayId/log") log(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Param("dayId") dayId: string,
    @Body() b: unknown,
  ) {
    return this.s.saveLog(r.auth, id, dayId, b, r.header("Idempotency-Key"));
  }
  @Roles("OWNER", "ADMIN", "TRAINER", "CLIENT")
  @Post("program-assignments/:id/comments")
  comment(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.s.comment(r.auth, id, b, r.header("Idempotency-Key"));
  }
}
@Module({
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
