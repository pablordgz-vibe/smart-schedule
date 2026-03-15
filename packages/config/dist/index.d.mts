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
    MAIL_FROM_ADDRESS: z.ZodDefault<z.ZodString>;
    MAIL_POLL_INTERVAL_MS: z.ZodDefault<z.ZodNumber>;
    MAIL_MAX_ATTEMPTS: z.ZodDefault<z.ZodNumber>;
    MAIL_PROCESSING_TIMEOUT_MS: z.ZodDefault<z.ZodNumber>;
    RATE_LIMIT_WINDOW_MS: z.ZodDefault<z.ZodNumber>;
    RATE_LIMIT_MAX: z.ZodDefault<z.ZodNumber>;
    AUTH_SOCIAL_PROVIDERS: z.ZodOptional<z.ZodString>;
    CALENDARIFIC_API_BASE_URL: z.ZodDefault<z.ZodString>;
    CALENDARIFIC_PORTAL_BASE_URL: z.ZodDefault<z.ZodString>;
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
    MAIL_FROM_ADDRESS: string;
    MAIL_POLL_INTERVAL_MS: number;
    MAIL_MAX_ATTEMPTS: number;
    MAIL_PROCESSING_TIMEOUT_MS: number;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX: number;
    CALENDARIFIC_API_BASE_URL: string;
    CALENDARIFIC_PORTAL_BASE_URL: string;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    OBJECT_STORAGE_BUCKET?: string | undefined;
    AUTH_SOCIAL_PROVIDERS?: string | undefined;
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
    MAIL_FROM_ADDRESS?: string | undefined;
    MAIL_POLL_INTERVAL_MS?: number | undefined;
    MAIL_MAX_ATTEMPTS?: number | undefined;
    MAIL_PROCESSING_TIMEOUT_MS?: number | undefined;
    RATE_LIMIT_WINDOW_MS?: number | undefined;
    RATE_LIMIT_MAX?: number | undefined;
    AUTH_SOCIAL_PROVIDERS?: string | undefined;
    CALENDARIFIC_API_BASE_URL?: string | undefined;
    CALENDARIFIC_PORTAL_BASE_URL?: string | undefined;
}>;
type Env = z.infer<typeof envSchema>;

declare class ConfigService {
    private readonly env;
    constructor();
    get<K extends keyof Env>(key: K): Env[K];
    get all(): Env;
}
declare const configService: ConfigService;

export { ConfigService, type Env, configService, envSchema };
