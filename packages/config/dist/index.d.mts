import { z } from 'zod';

declare const envSchema: z.ZodObject<{
    APP_EDITION: z.ZodDefault<z.ZodEnum<["commercial", "community"]>>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
    HOST: z.ZodDefault<z.ZodString>;
    PORT: z.ZodDefault<z.ZodNumber>;
    DATABASE_URL: z.ZodDefault<z.ZodString>;
    REDIS_URL: z.ZodDefault<z.ZodString>;
    OBJECT_STORAGE_ENDPOINT: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_ACCESS_KEY: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_SECRET_KEY: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_BUCKET: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_USE_SSL: z.ZodDefault<z.ZodBoolean>;
    JWT_SECRET: z.ZodDefault<z.ZodString>;
    SESSION_SECRET: z.ZodDefault<z.ZodString>;
    SESSION_COOKIE_NAME: z.ZodDefault<z.ZodString>;
    SESSION_TTL_SECONDS: z.ZodDefault<z.ZodNumber>;
    SETUP_STATE_FILE: z.ZodDefault<z.ZodString>;
    RATE_LIMIT_WINDOW_MS: z.ZodDefault<z.ZodNumber>;
    RATE_LIMIT_MAX: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    APP_EDITION: "commercial" | "community";
    NODE_ENV: "development" | "production" | "test";
    HOST: string;
    PORT: number;
    DATABASE_URL: string;
    REDIS_URL: string;
    OBJECT_STORAGE_USE_SSL: boolean;
    JWT_SECRET: string;
    SESSION_SECRET: string;
    SESSION_COOKIE_NAME: string;
    SESSION_TTL_SECONDS: number;
    SETUP_STATE_FILE: string;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX: number;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    OBJECT_STORAGE_BUCKET?: string | undefined;
}, {
    APP_EDITION?: "commercial" | "community" | undefined;
    NODE_ENV?: "development" | "production" | "test" | undefined;
    HOST?: string | undefined;
    PORT?: number | undefined;
    DATABASE_URL?: string | undefined;
    REDIS_URL?: string | undefined;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    OBJECT_STORAGE_BUCKET?: string | undefined;
    OBJECT_STORAGE_USE_SSL?: boolean | undefined;
    JWT_SECRET?: string | undefined;
    SESSION_SECRET?: string | undefined;
    SESSION_COOKIE_NAME?: string | undefined;
    SESSION_TTL_SECONDS?: number | undefined;
    SETUP_STATE_FILE?: string | undefined;
    RATE_LIMIT_WINDOW_MS?: number | undefined;
    RATE_LIMIT_MAX?: number | undefined;
}>;
type Env = z.infer<typeof envSchema>;

declare class ConfigService {
    private readonly env;
    constructor();
    get<K extends keyof Env>(key: K): Env[K];
    get all(): Env;
}
declare const configService: ConfigService;

export { ConfigService, configService };
