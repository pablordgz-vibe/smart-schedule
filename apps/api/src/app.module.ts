import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PersistenceModule } from './persistence/persistence.module';
import { SecurityModule } from './security/security.module';
import { SetupModule } from './setup/setup.module';
import { OrgModule } from './org/org.module';
import { CalModule } from './cal/cal.module';
import { TimeModule } from './time/time.module';
import { SchedModule } from './sched/sched.module';

@Module({
  imports: [
    PersistenceModule,
    IdentityModule,
    OrgModule,
    CalModule,
    SchedModule,
    TimeModule,
    SetupModule,
    SecurityModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
