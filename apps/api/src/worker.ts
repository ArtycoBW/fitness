import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { OutboxService } from "./modules/notifications/outbox.service";
import { PaymentService } from "./modules/payments/payment.service";
import { BookingCore } from "./modules/bookings/booking-core.service";
import { NotificationService } from "./modules/notifications/notification.service";
import { ExportService } from "./modules/operations/export.service";
import { MediaMaintenance } from "./modules/catalog/media.controller";
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const outbox = app.get(OutboxService);
  const payments = app.get(PaymentService);
  const bookings = app.get(BookingCore);
  const notifications = app.get(NotificationService),
    exports = app.get(ExportService);
  const media = app.get(MediaMaintenance);
  const tasks: Record<string, () => Promise<unknown>> = {
    outbox: () => outbox.tick(),
    payments: () => payments.tick(),
    bookings: () => bookings.tick(),
    notifications: () => notifications.tick(),
    exports: () => exports.tick(),
    media: () => media.tick(),
  };
  const running = new Map<string, Promise<unknown>>();
  const tick = () => {
    for (const [name, run] of Object.entries(tasks)) {
      if (running.has(name)) continue;
      const task = run()
        .catch(() => process.stderr.write("Worker task failed: " + name + "\n"))
        .finally(() => running.delete(name));
      running.set(name, task);
    }
  };
  const timer = setInterval(tick, 2000);
  tick();
  const close = async () => {
    clearInterval(timer);
    await Promise.allSettled(running.values());
    await app.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
void run();
