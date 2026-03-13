import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ContextService } from '../context.service';
import { routes } from '../app.routes';
import { AuthStateService } from '../auth-state.service';
import { SetupStateService } from '../setup/setup-state.service';
import type { SetupStateSnapshot } from '../setup/setup.types';
import { ShellComponent } from './shell.component';
import { AuthSessionSnapshot } from '../auth.types';

function setSetupState(service: SetupStateService, snapshot: SetupStateSnapshot) {
  service.setSnapshot(snapshot);
}

function buildSession(input: {
  active: 'personal' | 'organization' | 'system';
  includeOrganization?: boolean;
  includeSystem?: boolean;
}): AuthSessionSnapshot {
  return {
    activeContext:
      input.active === 'organization'
        ? { id: 'org-1', tenantId: 'org-1', type: 'organization' }
        : input.active === 'system'
          ? { id: 'admin-1', tenantId: null, type: 'system' }
          : { id: 'user-1', tenantId: null, type: 'personal' },
    availableContexts: [
      {
        key: 'personal',
        label: 'Personal',
        membershipRole: null,
        context: { id: 'user-1', tenantId: null, type: 'personal' },
      },
      ...(input.includeOrganization
        ? [
            {
              key: 'org:org-1',
              label: 'Organization: Atlas Ops',
              membershipRole: 'admin' as const,
              context: { id: 'org-1', tenantId: 'org-1', type: 'organization' as const },
            },
          ]
        : []),
      ...(input.includeSystem
        ? [
            {
              key: 'system',
              label: 'System Administration',
              membershipRole: null,
              context: { id: 'admin-1', tenantId: null, type: 'system' as const },
            },
          ]
        : []),
    ],
    authenticated: true,
    configuredSocialProviders: [],
    csrfToken: 'csrf-token',
    requireEmailVerification: false,
    user: {
      adminTier: input.includeSystem ? 0 : null,
      authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
      email: input.includeSystem ? 'admin@example.com' : 'user@example.com',
      emailVerified: true,
      id: input.includeSystem ? 'admin-1' : 'user-1',
      name: input.includeSystem ? 'Admin' : 'User',
      recoverUntil: null,
      roles: input.includeSystem ? ['system-admin', 'system-admin:tier:0'] : ['user'],
      state: 'active',
    },
  };
}

describe('ShellComponent', () => {
  it('renders the active context badge', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const contextService: ContextService = TestBed.inject(ContextService);
    const setupStateService: SetupStateService = TestBed.inject(SetupStateService);
    setSetupState(setupStateService, {
      admin: null,
      completedAt: '2026-03-11T00:00:00.000Z',
      configuredIntegrations: [],
      edition: 'community',
      isComplete: true,
      step: 'complete',
    });
    contextService.applySessionSnapshot(
      buildSession({
        active: 'organization',
        includeOrganization: true,
      }),
    );

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const hostElement = fixture.nativeElement as HTMLElement;
    const contextSwitcher = hostElement.querySelector(
      '[data-testid="context-switcher"]',
    ) as HTMLSelectElement | null;
    expect(contextSwitcher?.value).toBe('org:org-1');
  });

  it('redirects to the system admin landing page on a system context switch', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const router: Router = TestBed.inject(Router);
    const authStateService: AuthStateService = TestBed.inject(AuthStateService);
    const setupStateService: SetupStateService = TestBed.inject(SetupStateService);
    setSetupState(setupStateService, {
      admin: null,
      completedAt: '2026-03-11T00:00:00.000Z',
      configuredIntegrations: [],
      edition: 'community',
      isComplete: true,
      step: 'complete',
    });
    authStateService.setSnapshot(
      buildSession({
        active: 'personal',
        includeSystem: true,
      }),
    );
    TestBed.inject(ContextService).applySessionSnapshot(authStateService.snapshot());
    vi.spyOn(authStateService, 'switchContext').mockResolvedValue({
      ...buildSession({
        active: 'system',
        includeSystem: true,
      }),
    });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();

    void fixture.componentInstance.switchContext('system');
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith('/admin/setup');
  });

  it('limits global search results to routes allowed in the active context', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const contextService: ContextService = TestBed.inject(ContextService);
    const setupStateService: SetupStateService = TestBed.inject(SetupStateService);
    const authStateService: AuthStateService = TestBed.inject(AuthStateService);
    setSetupState(setupStateService, {
      admin: null,
      completedAt: '2026-03-11T00:00:00.000Z',
      configuredIntegrations: [],
      edition: 'community',
      isComplete: true,
      step: 'complete',
    });
    authStateService.setSnapshot(buildSession({ active: 'personal' }));
    contextService.applySessionSnapshot(authStateService.snapshot());

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const hostElement = fixture.nativeElement as HTMLElement;

    const searchInput = hostElement.querySelector(
      '[data-testid="global-search"]',
    ) as HTMLInputElement;
    searchInput.value = 'users';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(hostElement.querySelector('[data-testid="global-search-results"]')).toBeNull();

    contextService.applySessionSnapshot(
      buildSession({
        active: 'system',
        includeSystem: true,
      }),
    );
    fixture.componentInstance.updateSearch('users');
    fixture.detectChanges();
    await fixture.whenStable();

    const results = hostElement.querySelectorAll<HTMLElement>('[data-testid^="search-result-"]');
    expect(results.length).toBe(1);
    expect(results[0]?.textContent).toContain('Users');
  });
});
