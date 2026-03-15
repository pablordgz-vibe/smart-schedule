import { Global, Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { SecurityModule } from '../security/security.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { OAuthService } from './oauth.service';

@Global()
@Module({
  imports: [SecurityModule, OrgModule],
  controllers: [IdentityController],
  providers: [IdentityService, OAuthService],
  exports: [IdentityService, OAuthService],
})
export class IdentityModule {}
