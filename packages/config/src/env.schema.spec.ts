import { describe, expect, it } from "vitest";
import { envSchema } from "./env.schema";

describe("envSchema", () => {
  it("hydrates the runtime contract with safe defaults", () => {
    const parsed = envSchema.parse({});

    expect(parsed.APP_EDITION).toBe("community");
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.PORT).toBe(3000);
    expect(parsed.SESSION_COOKIE_NAME).toBe("smart_schedule_session");
    expect(parsed.SESSION_TTL_SECONDS).toBe(43_200);
    expect(parsed.RATE_LIMIT_MAX).toBe(60);
  });

  it("rejects invalid secrets and malformed URLs", () => {
    expect(() =>
      envSchema.parse({
        DATABASE_URL: "not-a-url",
        JWT_SECRET: "short",
        SESSION_SECRET: "short",
      }),
    ).toThrow();
  });

  it("coerces deployment flags from string environment variables", () => {
    const parsed = envSchema.parse({
      OBJECT_STORAGE_USE_SSL: "true",
      PORT: "4123",
      RATE_LIMIT_MAX: "120",
      RATE_LIMIT_WINDOW_MS: "90000",
      SESSION_TTL_SECONDS: "600",
    });

    expect(parsed.OBJECT_STORAGE_USE_SSL).toBe(true);
    expect(parsed.PORT).toBe(4123);
    expect(parsed.RATE_LIMIT_MAX).toBe(120);
    expect(parsed.RATE_LIMIT_WINDOW_MS).toBe(90_000);
    expect(parsed.SESSION_TTL_SECONDS).toBe(600);
  });
});
