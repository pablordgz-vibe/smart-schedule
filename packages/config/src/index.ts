import { envSchema, Env } from "./env.schema";

export class ConfigService {
  private readonly env: Env;

  constructor() {
    this.env = envSchema.parse(process.env);
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get all(): Env {
    return this.env;
  }
}

export const configService = new ConfigService();

export { envSchema };
export type { Env };
