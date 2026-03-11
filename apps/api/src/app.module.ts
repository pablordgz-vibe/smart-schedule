import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { SecurityModule } from './security/security.module';
import { SetupModule } from './setup/setup.module';

@Module({
  imports: [IdentityModule, SetupModule, SecurityModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
