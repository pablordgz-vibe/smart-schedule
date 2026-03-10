export type RuntimeEnvironmentContract = {
  NODE_ENV: "development" | "production" | "test";
  HOST: string;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  OBJECT_STORAGE_ENDPOINT?: string;
  OBJECT_STORAGE_ACCESS_KEY?: string;
  OBJECT_STORAGE_SECRET_KEY?: string;
  OBJECT_STORAGE_BUCKET?: string;
  OBJECT_STORAGE_USE_SSL: boolean;
  JWT_SECRET: string;
};
