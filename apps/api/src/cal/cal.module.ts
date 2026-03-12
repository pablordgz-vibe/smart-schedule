import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { SecurityModule } from '../security/security.module';
import { CalController } from './cal.controller';
import { CalService } from './cal.service';

@Module({
  imports: [SecurityModule, OrgModule],
  controllers: [CalController],
  providers: [CalService],
  exports: [CalService],
})
export class CalModule {}
