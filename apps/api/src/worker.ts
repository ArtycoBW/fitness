import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Db } from './db';
async function run() {
 const app = await NestFactory.createApplicationContext(AppModule);
 const db = app.get(Db);
 const timer = setInterval(() => { void db.$queryRaw`SELECT 1`.catch(() => process.stderr.write('Worker database health check failed\n')); }, 30000);
 const close = async () => { clearInterval(timer); await app.close(); };
 process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
}
void run();
