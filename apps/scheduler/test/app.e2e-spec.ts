import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { HealthController } from '../src/health/health.controller';

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
  let controller: HealthController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
