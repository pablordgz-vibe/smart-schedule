import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { AuthStateService } from './auth-state.service';
import { routes } from './app.routes';
import { SetupStateService } from './setup/setup-state.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAppInitializer(async () => {
      const router = inject(Router);
      const setupState = inject(SetupStateService);
      const authState = inject(AuthStateService);
      await setupState.load();
      await authState.loadIfReady(setupState.isComplete());
      if (authState.isAuthenticated() && router.url.startsWith('/auth/')) {
        await router.navigateByUrl('/home');
      }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
