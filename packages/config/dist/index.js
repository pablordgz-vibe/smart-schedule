"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ConfigService: () => ConfigService,
  configService: () => configService
});
module.exports = __toCommonJS(index_exports);

// src/env.schema.ts
var import_zod = require("zod");
var envSchema = import_zod.z.object({
  APP_EDITION: import_zod.z.enum(["commercial", "community"]).default("community"),
  NODE_ENV: import_zod.z.enum(["development", "production", "test"]).default("development"),
  HOST: import_zod.z.string().default("0.0.0.0"),
  PORT: import_zod.z.coerce.number().default(3e3),
  DATABASE_URL: import_zod.z.string().url().default("postgresql://postgres:postgres@localhost:5432/smart_schedule"),
  REDIS_URL: import_zod.z.string().url().default("redis://localhost:6379"),
  OBJECT_STORAGE_ENDPOINT: import_zod.z.string().optional(),
  OBJECT_STORAGE_ACCESS_KEY: import_zod.z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: import_zod.z.string().optional(),
  OBJECT_STORAGE_BUCKET: import_zod.z.string().optional(),
  OBJECT_STORAGE_USE_SSL: import_zod.z.coerce.boolean().default(false),
  JWT_SECRET: import_zod.z.string().min(32).default("development-jwt-secret-must-be-overridden-0001"),
  SESSION_SECRET: import_zod.z.string().min(32).default("development-session-secret-must-change-0001"),
  SESSION_COOKIE_NAME: import_zod.z.string().default("smart_schedule_session"),
  SESSION_TTL_SECONDS: import_zod.z.coerce.number().int().positive().default(43200),
  SETUP_STATE_FILE: import_zod.z.string().default(".smart-schedule/setup-state.json"),
  RATE_LIMIT_WINDOW_MS: import_zod.z.coerce.number().int().positive().default(6e4),
  RATE_LIMIT_MAX: import_zod.z.coerce.number().int().positive().default(60)
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConfigService,
  configService
});
