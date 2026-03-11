process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/smart_schedule';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-long-enough-0001';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-0001';
process.env.SESSION_COOKIE_NAME ??= 'smart_schedule_session';
process.env.SESSION_TTL_SECONDS ??= '43200';
process.env.RATE_LIMIT_WINDOW_MS ??= '60000';
process.env.RATE_LIMIT_MAX ??= '60';
