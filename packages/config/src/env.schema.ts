import { z } from "zod";

export const envSchema = z.object({
  APP_EDITION: z.enum(["commercial", "community"]).default("community"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/smart_schedule"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  OBJECT_STORAGE_ENDPOINT: z.string().optional(),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  OBJECT_STORAGE_USE_SSL: z.coerce.boolean().default(false),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("development-jwt-secret-must-be-overridden-0001"),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("development-session-secret-must-change-0001"),
  SESSION_COOKIE_NAME: z.string().default("smart_schedule_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(43200),
  MAIL_FROM_ADDRESS: z
    .string()
    .email()
    .default("no-reply@smart-schedule.local"),
  MAIL_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  MAIL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  MAIL_PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  AUTH_SOCIAL_PROVIDERS: z.string().optional(),
  CALENDARIFIC_API_BASE_URL: z.string().url().default("https://calendarific.com/api/v2"),
  CALENDARIFIC_PORTAL_BASE_URL: z.string().url().default("https://calendarific.com"),
});

export type Env = z.infer<typeof envSchema>;
