import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ContextService } from '../context.service';
import { routes } from '../app.routes';
import { AuthStateService } from '../auth-state.service';
import { SetupStateService } from '../setup/setup-state.service';
import type { SetupStateSnapshot } from '../setup/setup.types';
import { ShellComponent } from './shell.component';

function setSetupState(service: SetupStateService, snapshot: SetupStateSnapshot) {
  service.setSnapshot(snapshot);
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
    contextService.setActiveContext('organization');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const hostElement = fixture.nativeElement as HTMLElement;
    const badge = hostElement.querySelector('[data-testid="context-badge"]');
    expect(badge?.textContent).toContain('Organization: Atlas Ops');
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
    authStateService.setSnapshot({
      authenticated: true,
      configuredSocialProviders: [],
      csrfToken: 'csrf-token',
      requireEmailVerification: false,
      user: {
        adminTier: 0,
        authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
        email: 'admin@example.com',
        emailVerified: true,
        id: 'admin-1',
        name: 'Admin',
        recoverUntil: null,
        roles: ['system-admin', 'system-admin:tier:0'],
        state: 'active',
      },
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/calendar');

    fixture.componentInstance.switchContext('system');
    await fixture.whenStable();

    expect(router.url).toBe('/admin/setup');
  });
});
