// src/env.schema.ts
import { z } from "zod";
var envSchema = z.object({
  APP_EDITION: z.enum(["commercial", "community"]).default("community"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(3e3),
  DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/smart_schedule"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  OBJECT_STORAGE_ENDPOINT: z.string().optional(),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  OBJECT_STORAGE_USE_SSL: z.coerce.boolean().default(false),
  JWT_SECRET: z.string().min(32).default("development-jwt-secret-must-be-overridden-0001"),
  SESSION_SECRET: z.string().min(32).default("development-session-secret-must-change-0001"),
  SESSION_COOKIE_NAME: z.string().default("smart_schedule_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(43200),
  MAIL_FROM_ADDRESS: z.string().email().default("no-reply@smart-schedule.local"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(6e4),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60)
});

// src/index.ts
var ConfigService = class {
  env;
  constructor() {
    this.env = envSchema.parse(process.env);
  }
  get(key) {
    return this.env[key];
  }
  get all() {
    return this.env;
  }
};
var configService = new ConfigService();
export {
  ConfigService,
  configService,
  envSchema
};
