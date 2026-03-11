import { SetMetadata } from '@nestjs/common';

export const BOOTSTRAP_ROUTE_KEY = 'bootstrap-route';

export const BootstrapRoute = () => SetMetadata(BOOTSTRAP_ROUTE_KEY, true);
