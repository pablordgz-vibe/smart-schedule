import { Controller, Get } from '@nestjs/common';
import { Public } from '../security/public-route.decorator';
import { SetupStatusRoute } from './setup-status-route.decorator';
import { SetupService } from './setup.service';

@Public()
@SetupStatusRoute()
@Controller('platform')
export class BootstrapStatusController {
  constructor(private readonly setupService: SetupService) {}

  @Get('bootstrap-status')
  async getStatus() {
    const state = await this.setupService.getSetupState();

    return {
      edition: state.edition,
      enabledIntegrationCodes: state.configuredIntegrations
        .filter((integration) => integration.enabled)
        .map((integration) => integration.code),
      isComplete: state.isComplete,
    };
  }
}
