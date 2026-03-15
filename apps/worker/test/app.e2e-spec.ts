import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { HealthController } from '../src/health/health.controller';
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
  let controller: HealthController;

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
    controller = app.get(HealthController);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns liveness status', async () => {
    const body = (await controller.check()) as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.info.app.status).toBe('up');
  });

  it('returns readiness status', async () => {
    const body = (await controller.readiness()) as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.info.app.status).toBe('up');
  });
});
