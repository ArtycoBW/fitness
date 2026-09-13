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
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    WEB_URL: z.string().url().default("http://localhost:3000"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_FROM: z.string().default("club@fitness.local"),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_REQUIRE_TLS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    PAYMENT_PROVIDER: z.literal("simulator").default("simulator"),
    UPLOADS_DIR: z.string().default("./uploads"),
    OUTBOX_SECRET: z.string().min(32),
  })
  .refine((v) => !!v.SMTP_USER === !!v.SMTP_PASSWORD, {
    message: "SMTP_USER and SMTP_PASSWORD must be configured together",
  })
  .parse(process.env);
