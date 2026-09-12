import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { env } from './config';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
 constructor() { super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) }); }
 async onModuleInit() { await this.$connect(); }
 async onModuleDestroy() { await this.$disconnect(); }
}
