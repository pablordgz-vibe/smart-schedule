import { Global, Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { BootstrapStatusController } from './bootstrap-status.controller';
import { SetupAdminController, SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Global()
@Module({
  imports: [SecurityModule],
  controllers: [BootstrapStatusController, SetupController, SetupAdminController],
  providers: [SetupService],
  exports: [SetupService],
})
export class SetupModule {}
