import { SetMetadata } from '@nestjs/common';

export const SETUP_STATUS_ROUTE_KEY = 'setup_status_route';

export const SetupStatusRoute = () => SetMetadata(SETUP_STATUS_ROUTE_KEY, true);
