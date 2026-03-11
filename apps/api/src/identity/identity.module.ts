import { Global, Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Global()
@Module({
  imports: [SecurityModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
