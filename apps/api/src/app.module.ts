import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [SecurityModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
