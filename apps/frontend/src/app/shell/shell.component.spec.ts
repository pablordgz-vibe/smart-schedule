import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ContextService } from '../context.service';
import { DirtyStateService } from '../dirty-state.service';
import { routes } from '../app.routes';
import { AuthStateService } from '../auth-state.service';
import { SetupStateService } from '../setup/setup-state.service';
import { ThemeService } from '../theme.service';
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
    const fixture = TestBed.createComponent(ShellComponent);
    authStateService.setSnapshot(
      buildSession({
        active: 'organization',
        includeOrganization: true,
      }),
    );
    contextService.applySessionSnapshot(authStateService.snapshot());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hostElement = fixture.nativeElement as HTMLElement;
    const contextSwitcher = hostElement.querySelector('[data-testid="context-switcher"]');
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

  it('opens compose, settings, and logout actions from the header affordances', async () => {
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
    authStateService.setSnapshot(buildSession({ active: 'personal' }));
    TestBed.inject(ContextService).applySessionSnapshot(authStateService.snapshot());
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const logoutSpy = vi.spyOn(authStateService, 'logout').mockResolvedValue();

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.toggleQuickCreateMenu();
    fixture.detectChanges();
    expect(fixture.componentInstance.quickCreateMenuOpen()).toBe(true);

    fixture.componentInstance.openCompose('event');
    expect(navigateSpy).toHaveBeenCalledWith('/calendar?compose=event');
    expect(fixture.componentInstance.quickCreateMenuOpen()).toBe(false);

    fixture.componentInstance.toggleUserMenu();
    fixture.detectChanges();
    expect(fixture.componentInstance.userMenuOpen()).toBe(true);

    fixture.componentInstance.openSettings();
    expect(navigateSpy).toHaveBeenCalledWith('/settings');
    expect(fixture.componentInstance.userMenuOpen()).toBe(false);

    fixture.componentInstance.toggleUserMenu();
    await fixture.componentInstance.logout();
    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/auth/sign-in');
    expect(fixture.componentInstance.userMenuOpen()).toBe(false);
  });

  it('keeps header panels mutually exclusive and sends system quick create to setup', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const router: Router = TestBed.inject(Router);
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
    authStateService.setSnapshot(
      buildSession({
        active: 'system',
        includeSystem: true,
      }),
    );
    TestBed.inject(ContextService).applySessionSnapshot(authStateService.snapshot());
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.toggleHelpPanel();
    expect(fixture.componentInstance.helpPanelOpen()).toBe(true);

    fixture.componentInstance.toggleUserMenu();
    expect(fixture.componentInstance.helpPanelOpen()).toBe(false);
    expect(fixture.componentInstance.userMenuOpen()).toBe(true);

    fixture.componentInstance.toggleQuickCreateMenu();
    expect(navigateSpy).toHaveBeenCalledWith('/admin/setup');
    expect(fixture.componentInstance.quickCreateMenuOpen()).toBe(false);
    expect(fixture.componentInstance.userMenuOpen()).toBe(false);
  });

  it('guards dirty context switches and resets search when opening results', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const router: Router = TestBed.inject(Router);
    const authStateService: AuthStateService = TestBed.inject(AuthStateService);
    const contextService: ContextService = TestBed.inject(ContextService);
    const dirtyStateService: DirtyStateService = TestBed.inject(DirtyStateService);
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
        includeOrganization: true,
      }),
    );
    contextService.applySessionSnapshot(authStateService.snapshot());
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const switchSpy = vi.spyOn(authStateService, 'switchContext').mockResolvedValue(
      buildSession({
        active: 'organization',
        includeOrganization: true,
      }),
    );
    const approveSpy = vi.spyOn(dirtyStateService, 'approveNextNavigation');
    const confirmSpy = vi.spyOn(window, 'confirm');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    dirtyStateService.markDirty();
    confirmSpy.mockReturnValueOnce(false);
    await fixture.componentInstance.switchContext('org:org-1');
    expect(switchSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.contextSwitcherValue()).toBe('personal');

    confirmSpy.mockReturnValueOnce(true);
    await fixture.componentInstance.switchContext('org:org-1');
    expect(approveSpy).toHaveBeenCalled();
    expect(switchSpy).toHaveBeenCalledWith({
      contextType: 'organization',
      organizationId: 'org-1',
    });
    expect(navigateSpy).toHaveBeenCalledWith('/');

    fixture.componentInstance.updateSearch('calendar');
    fixture.componentInstance.toggleHelpPanel();
    fixture.componentInstance.openFirstSearchResult(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fixture.componentInstance.searchQuery()).toBe('');
    expect(fixture.componentInstance.helpPanelOpen()).toBe(false);
  });

  it('restores the context switcher on invalid targets and exposes the remaining header helpers', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const authStateService: AuthStateService = TestBed.inject(AuthStateService);
    const contextService: ContextService = TestBed.inject(ContextService);
    const themeService: ThemeService = TestBed.inject(ThemeService);
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
        includeOrganization: true,
      }),
    );
    contextService.applySessionSnapshot(authStateService.snapshot());
    const themeSpy = vi.spyOn(themeService, 'toggleTheme');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.openFirstSearchResult(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.componentInstance.switchContext('missing-context');
    await Promise.resolve();
    fixture.componentInstance.toggleHelpPanel();
    fixture.componentInstance.toggleTheme();

    expect(fixture.componentInstance.contextSwitcherValue()).toBe('personal');
    expect(themeSpy).toHaveBeenCalled();
    expect(fixture.componentInstance.helpPanelOpen()).toBe(false);
    expect(fixture.componentInstance.areaLabel('end-user')).toBe('End-user');
    expect(fixture.componentInstance.areaLabel('org-admin')).toBe('Organization admin');
    expect(fixture.componentInstance.areaLabel('system-admin')).toBe('System admin');
  });

  it('opens the schedule builder from the header quick actions', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const router: Router = TestBed.inject(Router);
    const authStateService: AuthStateService = TestBed.inject(AuthStateService);
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
    authStateService.setSnapshot(buildSession({ active: 'personal' }));
    contextService.applySessionSnapshot(authStateService.snapshot());
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.toggleQuickCreateMenu();
    fixture.componentInstance.openScheduleBuilder();

    expect(fixture.componentInstance.quickCreateMenuOpen()).toBe(false);
    expect(fixture.componentInstance.searchQuery()).toBe('');
    expect(navigateSpy).toHaveBeenCalledWith('/schedules/builder');
  });
});
