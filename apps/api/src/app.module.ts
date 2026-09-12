import { Controller, Get, Module } from '@nestjs/common';
import { Db } from './db';
@Controller('health')
class HealthController {
 constructor(private readonly db: Db) {}
 @Get('live') live() { return { status: 'ok' }; }
 @Get('ready') async ready() { await this.db.$queryRaw`SELECT 1`; return { status: 'ok', database: 'connected' }; }
}
@Module({ providers: [Db], controllers: [HealthController], exports: [Db] })
export class AppModule {}
