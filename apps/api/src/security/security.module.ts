import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditTrailInterceptor } from './audit-trail.interceptor';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextStore } from './request-context.store';
import { SecurityKernelGuard } from './security-kernel.guard';

@Module({
  providers: [
    RequestContextStore,
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
