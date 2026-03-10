import { z } from 'zod';

declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
    PORT: z.ZodDefault<z.ZodNumber>;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
    OBJECT_STORAGE_ENDPOINT: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_ACCESS_KEY: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_SECRET_KEY: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_BUCKET: z.ZodOptional<z.ZodString>;
    OBJECT_STORAGE_USE_SSL: z.ZodDefault<z.ZodBoolean>;
    JWT_SECRET: z.ZodString;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    DATABASE_URL: string;
    REDIS_URL: string;
    OBJECT_STORAGE_USE_SSL: boolean;
    JWT_SECRET: string;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    OBJECT_STORAGE_BUCKET?: string | undefined;
}, {
    DATABASE_URL: string;
    REDIS_URL: string;
    JWT_SECRET: string;
    NODE_ENV?: "development" | "production" | "test" | undefined;
    PORT?: number | undefined;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    OBJECT_STORAGE_BUCKET?: string | undefined;
    OBJECT_STORAGE_USE_SSL?: boolean | undefined;
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
