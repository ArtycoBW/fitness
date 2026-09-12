import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
config({
  path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
  quiet: true,
});
export const env = z
  .object({
    DATABASE_URL: z.string().url(),
    API_PORT: z.coerce.number().default(4000),
    WEB_URL: z.string().url().default("http://localhost:3000"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_FROM: z.string().default("club@fitness.local"),
    PAYMENT_PROVIDER: z.literal("simulator").default("simulator"),
    UPLOADS_DIR: z.string().default("./uploads"),
    OUTBOX_SECRET: z.string().min(32),
  })
  .parse(process.env);
