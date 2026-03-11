import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditTrailInterceptor } from './audit-trail.interceptor';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextStore } from './request-context.store';
import { SecurityKernelGuard } from './security-kernel.guard';
import { SecurityTestController } from './security-test.controller';
import { SessionService } from './session.service';

const securityControllers =
  process.env.NODE_ENV === 'test' ? [SecurityTestController] : [];

@Module({
  controllers: securityControllers,
  providers: [
    RequestContextStore,
    SessionService,
    RateLimitService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SecurityKernelGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditTrailInterceptor,
    },
  ],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
