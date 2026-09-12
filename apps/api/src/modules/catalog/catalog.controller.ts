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
import { AuthRequest, Public, Roles } from "../auth/access";
@Controller("catalog")
@Roles("OWNER", "ADMIN", "RECEPTION")
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
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
  @Public() @Get("public/:kind") list(@Param("kind") kind: string) {
    return this.service.publicList(kind);
  }
  @Public() @Get("public/:kind/:slug") detail(
    @Param("kind") kind: string,
    @Param("slug") slug: string,
  ) {
    return this.service.publicList(kind, slug);
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
}
@Module({
  controllers: [CatalogController, PublicCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
