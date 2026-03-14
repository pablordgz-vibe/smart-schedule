import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { SecurityModule } from '../security/security.module';
import { HolidayProviderService } from './holiday-provider.service';
import { TimeController } from './time.controller';
import { TimeService } from './time.service';

@Module({
  imports: [SecurityModule, OrgModule],
  controllers: [TimeController],
  providers: [HolidayProviderService, TimeService],
  exports: [TimeService],
})
export class TimeModule {}
