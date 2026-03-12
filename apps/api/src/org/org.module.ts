import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

@Module({
  imports: [SecurityModule],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
