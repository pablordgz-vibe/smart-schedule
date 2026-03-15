import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DatabaseService } from '../src/persistence/database.service';

type HealthResponse = {
  status: string;
  info: {
    app: {
      status: string;
    };
  };
};

describe('Worker health endpoints (e2e)', () => {
  let app: INestApplication;

  function getTestServer() {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        getPool: () => ({
          connect: () =>
            Promise.resolve({
              query: () => Promise.resolve({ rows: [] }),
              release: () => undefined,
            }),
        }),
        query: () => Promise.resolve({ rows: [] }),
      })
      .compile();

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
