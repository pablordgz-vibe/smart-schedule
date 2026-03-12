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
import { ContextService } from './context.service';
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
      const contextService = inject(ContextService);
      await setupState.load();
      await authState.loadIfReady(setupState.isComplete());
      contextService.applySessionSnapshot(authState.snapshot());
      if (authState.isAuthenticated() && router.url.startsWith('/auth/')) {
        await router.navigateByUrl(contextService.fallbackRoute());
      }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
