import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { Errors } from './errors';
import { env } from './config';
async function bootstrap() {
 const app = await NestFactory.create(AppModule);
 app.setGlobalPrefix('api/v1');
 app.use(helmet()); app.use(cookieParser());
 app.use((_req: Request,res: Response,next: NextFunction) => { res.setHeader('X-Request-Id', randomUUID()); next(); });
 app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
 app.useGlobalFilters(new Errors());
 if (env.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Fitness API').setVersion('1.0').addCookieAuth('fitness_session').build()));
 app.enableShutdownHooks();
 await app.listen(env.API_PORT, '0.0.0.0');
}
void bootstrap();
