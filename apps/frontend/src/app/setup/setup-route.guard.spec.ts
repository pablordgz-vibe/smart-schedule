import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { setupRouteGuard } from './setup-route.guard';
import { SetupStateService } from './setup-state.service';

describe('setupRouteGuard', () => {
  it('redirects setup to home after bootstrap completes', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    const service = TestBed.inject(SetupStateService) as SetupStateService & {
      readonly state: { set: (value: unknown) => void };
    };
    const router = TestBed.inject(Router);

    service['state'].set({
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

    const result = TestBed.runInInjectionContext(() =>
      setupRouteGuard({} as never, {} as never),
    );

    expect(router.serializeUrl(result as ReturnType<typeof router.parseUrl>)).toBe('/home');
  });
});
