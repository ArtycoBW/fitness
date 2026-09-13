import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Module,
} from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import { ResourceModule } from "../schedule/resource.service";
import { AuthRequest, Public, Roles } from "../auth/access";
@Controller("catalog")
@Roles("OWNER", "ADMIN", "RECEPTION")
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
  @Roles("OWNER", "ADMIN")
  @Post(":kind/:id/periods/:periodId/cancel")
  cancelPeriod(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Param("periodId") periodId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.cancelInterval(req.auth, kind, id, periodId, body);
  }
  @Get(":kind") list(@Param("kind") kind: string, @Query() query: unknown) {
    return this.service.list(kind, query);
  }
  @Get(":kind/:id") detail(
    @Param("kind") kind: string,
    @Param("id") id: string,
  ) {
    return this.service.detail(kind, id);
  }
  @Post(":kind") create(
    @Param("kind") kind: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.save(req.auth, kind, body);
  }
  @Patch(":kind/:id") update(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.save(req.auth, kind, body, id);
  }
  @Post(":kind/:id/archive") archive(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.archive(req.auth, kind, id, body);
  }
  @Post("clients/:id/notes") note(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.note(req.auth, id, body);
  }
  @Roles("OWNER", "ADMIN") @Post("clients/:id/visits-access") access(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.blockVisits(req.auth, id, body);
  }
  @Roles("OWNER", "ADMIN") @Post("clients/:id/trainers") assign(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.assign(req.auth, id, body);
  }
  @Post("clients/:id/invitation") invitation(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.invitation(req.auth, id, body);
  }
  @Roles("OWNER", "ADMIN") @Post("halls/:id/closures") closure(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.interval(req.auth, "halls", id, body);
  }
  @Roles("OWNER", "ADMIN") @Post("trainers/:id/absences") absence(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.interval(req.auth, "trainers", id, body);
  }
}
@Controller()
export class PublicCatalogController {
  constructor(private readonly service: CatalogService) {}
  @Public() @Get("public/halls") halls() {
    return this.service.publicList("halls");
  }
  @Public() @Get("public/halls/:slug") hall(@Param("slug") slug: string) {
    return this.service.publicList("halls", slug);
  }
  @Public() @Get("public/workouts") workouts() {
    return this.service.publicList("workouts");
  }
  @Public() @Get("public/workouts/:slug") workout(@Param("slug") slug: string) {
    return this.service.publicList("workouts", slug);
  }
  @Public() @Get("public/trainers") trainers() {
    return this.service.publicList("trainers");
  }
  @Public() @Get("public/trainers/:slug") trainer(@Param("slug") slug: string) {
    return this.service.publicList("trainers", slug);
  }
  @Roles("TRAINER") @Get("trainer/clients") clients(@Req() req: AuthRequest) {
    return this.service.ownClients(req.auth);
  }
  @Roles("TRAINER") @Get("trainer/availability") availability(
    @Req() req: AuthRequest,
  ) {
    return this.service.ownAvailability(req.auth);
  }
  @Roles("TRAINER") @Post("trainer/availability") absence(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.ownAbsence(req.auth, body);
  }
  @Roles("TRAINER") @Post("trainer/availability/:id/cancel") cancelAbsence(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.cancelInterval(
      req.auth,
      "trainers",
      req.auth.trainerId ?? "",
      id,
      body,
    );
  }
}
@Module({
  imports: [ResourceModule],
  controllers: [CatalogController, PublicCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
