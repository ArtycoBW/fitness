import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  Module,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { Db } from "../../db";
import { env } from "../../config";
import { AuthRequest, Public } from "../auth/access";
import { fail } from "../../common/business-error";
import { parse, uuid } from "../../common/validation";
@Controller("media")
export class MediaController {
  constructor(private readonly db: Db) {}
  @Public() @Get(":file") file(
    @Param("file") file: string,
    @Res() res: Response,
  ) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(file))
      fail("NOT_FOUND", "Изображение не найдено", 404);
    res.type("image/webp").set("Cache-Control", "public, max-age=86400");
    res.sendFile(join(resolve(env.UPLOADS_DIR), file), (error) => {
      if (error && !res.headersSent)
        res
          .status(404)
          .json({ code: "NOT_FOUND", message: "Изображение не найдено" });
    });
  }
  @Post(":kind/:id")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() req: AuthRequest,
  ) {
    parse(uuid, id);
    const admin = req.auth.roles.some((r) => ["OWNER", "ADMIN"].includes(r));
    if (kind === "users") {
      if (id !== req.auth.id && !admin)
        fail("FORBIDDEN", "Недостаточно прав", 403);
    } else if (!admin || !["halls", "workouts"].includes(kind))
      fail("FORBIDDEN", "Недостаточно прав", 403);
    if (!file?.buffer)
      fail("IMAGE_REQUIRED", "Выберите изображение до 5 МБ", 400);
    let bytes: Buffer;
    try {
      const source = sharp(file.buffer, { limitInputPixels: 20000000 });
      const meta = await source.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? ""))
        fail("IMAGE_FORMAT", "Используйте JPG, PNG или WebP", 400);
      bytes = await source
        .rotate()
        .resize({
          width: kind === "users" ? 600 : 1600,
          height: kind === "users" ? 600 : 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      fail(
        "IMAGE_INVALID",
        "Не удалось прочитать изображение. Используйте JPG, PNG или WebP до 5 МБ",
        400,
      );
    }
    const name = randomUUID() + ".webp",
      path = join(resolve(env.UPLOADS_DIR), name);
    await mkdir(resolve(env.UPLOADS_DIR), { recursive: true });
    await writeFile(path, bytes);
    const url = "/api/v1/media/" + name;
    try {
      if (kind === "users")
        await this.db.user.update({ where: { id }, data: { avatarUrl: url } });
      else if (kind === "halls")
        await this.db.hall.update({
          where: { id },
          data: { imageUrl: url, version: { increment: 1 } },
        });
      else
        await this.db.workoutType.update({
          where: { id },
          data: { imageUrl: url, version: { increment: 1 } },
        });
    } catch (e) {
      await unlink(path);
      throw e;
    }
    return { url };
  }
}
@Module({ controllers: [MediaController] })
export class MediaModule {}
