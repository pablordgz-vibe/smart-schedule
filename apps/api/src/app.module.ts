import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';
import { SetupModule } from './setup/setup.module';

@Module({
  imports: [SetupModule, SecurityModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
