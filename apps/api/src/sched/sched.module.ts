import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { SecurityModule } from '../security/security.module';
import { SchedController } from './sched.controller';
import { SchedService } from './sched.service';

@Module({
  imports: [SecurityModule, OrgModule],
  controllers: [SchedController],
  providers: [SchedService],
  exports: [SchedService],
})
export class SchedModule {}
