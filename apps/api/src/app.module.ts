import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SecurityModule } from './security/security.module';
import { SetupModule } from './setup/setup.module';

@Module({
  imports: [
    PersistenceModule,
    IdentityModule,
    SetupModule,
    SecurityModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
