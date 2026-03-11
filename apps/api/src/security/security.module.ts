import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { AuditTrailInterceptor } from './audit-trail.interceptor';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RequestContextStore } from './request-context.store';
import { SecurityKernelGuard } from './security-kernel.guard';
import { SecurityTestController } from './security-test.controller';
import { SessionService } from './session.service';

const securityControllers =
  process.env.NODE_ENV === 'test' ? [SecurityTestController] : [];

@Module({
  controllers: securityControllers,
  providers: [
    AuditService,
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
  exports: [AuditService, SessionService],
})
export class SecurityModule {}
