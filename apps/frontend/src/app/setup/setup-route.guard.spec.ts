import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { setupRouteGuard } from './setup-route.guard';
import { SetupStateService } from './setup-state.service';
import type { SetupStateSnapshot } from './setup.types';

function setSetupState(service: SetupStateService, snapshot: SetupStateSnapshot) {
  service.setSnapshot(snapshot);
}

describe('setupRouteGuard', () => {
  it('redirects setup to home after bootstrap completes', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    const service: SetupStateService = TestBed.inject(SetupStateService);
    const router: Router = TestBed.inject(Router);

    setSetupState(service, {
      admin: {
        createdAt: '2026-03-11T00:00:00.000Z',
        email: 'admin@example.com',
        id: 'admin-1',
        name: 'Initial Admin',
        role: 'system-admin',
      },
      completedAt: '2026-03-11T00:00:00.000Z',
      configuredIntegrations: [],
      edition: 'community',
      isComplete: true,
      step: 'complete',
    });

    const result = TestBed.runInInjectionContext(() => setupRouteGuard({} as never, {} as never));

    expect(router.serializeUrl(result as ReturnType<typeof router.parseUrl>)).toBe('/home');
  });
});
