import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { configureOpenApi } from './openapi';
import { registerRequestContextHook } from './security/request-context.middleware';
import { RequestContextStore } from './security/request-context.store';
import { SessionService } from './security/session.service';

export function createApiAdapter() {
  return new FastifyAdapter({
    trustProxy: true,
  });
}

export function configureApiApp(app: NestFastifyApplication) {
  registerRequestContextHook({
    fastify: app.getHttpAdapter().getInstance(),
    requestContextStore: app.get(RequestContextStore),
    sessionService: app.get(SessionService),
  });
  configureOpenApi(app);
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  return app;
}
