import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { OutboxService } from "./modules/notifications/outbox.service";
import { PaymentService } from "./modules/payments/payment.service";
import { BookingCore } from "./modules/bookings/booking-core.service";
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const outbox = app.get(OutboxService);
  const payments = app.get(PaymentService);
  const bookings = app.get(BookingCore);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await outbox.tick();
      await payments.tick();
      await bookings.tick();
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
