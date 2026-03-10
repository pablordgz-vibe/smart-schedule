// src/env.schema.ts
import { z } from "zod";
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(3e3),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OBJECT_STORAGE_ENDPOINT: z.string().optional(),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  OBJECT_STORAGE_USE_SSL: z.coerce.boolean().default(false),
  JWT_SECRET: z.string().min(32)
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
  configService
};
