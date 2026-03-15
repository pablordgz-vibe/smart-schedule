import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { PersistenceModule } from './persistence/persistence.module';

@Module({
  imports: [PersistenceModule, MailModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
