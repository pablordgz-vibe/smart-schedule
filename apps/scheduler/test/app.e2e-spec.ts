import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

type HealthResponse = {
  status: string;
  info: {
    app: {
      status: string;
    };
  };
};

describe('Scheduler health endpoints (e2e)', () => {
  let app: INestApplication;

  function getTestServer() {
    return app.getHttpAdapter().getInstance() as Parameters<typeof request>[0];
  }

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns liveness status', async () => {
    const response = await request(getTestServer()).get('/health').expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.info.app.status).toBe('up');
  });

  it('returns readiness status', async () => {
    const response = await request(getTestServer())
      .get('/health/readiness')
      .expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.info.app.status).toBe('up');
  });
});
