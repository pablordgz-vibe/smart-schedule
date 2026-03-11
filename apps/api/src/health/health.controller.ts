import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { Public } from '../security/public-route.decorator';
import { BootstrapRoute } from '../setup/bootstrap-route.decorator';

@Public()
@BootstrapRoute()
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => Promise.resolve({ app: { status: 'up' } }),
    ]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => Promise.resolve({ app: { status: 'up' } }),
    ]);
  }
}
