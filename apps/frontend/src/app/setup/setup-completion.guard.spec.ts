import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { setupCompletionChildGuard, setupCompletionGuard } from './setup-completion.guard';
import { SetupStateService } from './setup-state.service';
import type { SetupStateSnapshot } from './setup.types';

function setSetupState(service: SetupStateService, snapshot: SetupStateSnapshot) {
  service.setSnapshot(snapshot);
}

describe('setupCompletionGuard', () => {
  it('redirects regular routes to setup when bootstrap is incomplete', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    const service: SetupStateService = TestBed.inject(SetupStateService);
    const router: Router = TestBed.inject(Router);

    setSetupState(service, {
      admin: null,
      completedAt: null,
      configuredIntegrations: [],
      edition: 'community',
      isComplete: false,
      step: 'integrations',
    });

    const result = TestBed.runInInjectionContext(() =>
      setupCompletionGuard({} as never, {} as never),
    );
    const childResult = TestBed.runInInjectionContext(() =>
      setupCompletionChildGuard({} as never, {} as never),
    );

    expect(router.serializeUrl(result as ReturnType<typeof router.parseUrl>)).toBe('/setup');
    expect(router.serializeUrl(childResult as ReturnType<typeof router.parseUrl>)).toBe('/setup');
  });
});
