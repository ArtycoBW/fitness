import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { OutboxService } from "./modules/notifications/outbox.service";
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const outbox = app.get(OutboxService);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await outbox.tick();
    } catch {
      process.stderr.write("Worker tick failed\n");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 2000);
  await tick();
  const close = async () => {
    clearInterval(timer);
    await app.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
void run();
