import { Global, Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Global()
@Module({
  imports: [SecurityModule],
  controllers: [SetupController],
  providers: [SetupService],
  exports: [SetupService],
})
export class SetupModule {}
