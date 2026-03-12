import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ContextService } from './context.service';
import { AuthSessionSnapshot } from './auth.types';

const sessionWithOrgAndSystem: AuthSessionSnapshot = {
  activeContext: {
    id: 'org-1',
    tenantId: 'org-1',
    type: 'organization',
  },
  availableContexts: [
    {
      key: 'personal',
      label: 'Personal',
      membershipRole: null,
      context: { id: 'user-1', tenantId: null, type: 'personal' },
    },
    {
      key: 'org:org-1',
      label: 'Organization: Atlas Ops',
      membershipRole: 'admin',
      context: { id: 'org-1', tenantId: 'org-1', type: 'organization' },
    },
    {
      key: 'system',
      label: 'System Administration',
      membershipRole: null,
      context: { id: 'user-1', tenantId: null, type: 'system' },
    },
  ],
  authenticated: true,
  configuredSocialProviders: [],
  csrfToken: 'csrf',
  requireEmailVerification: false,
  user: {
    adminTier: 0,
    authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
    email: 'admin@example.com',
    emailVerified: true,
    id: 'user-1',
    name: 'Admin',
    recoverUntil: null,
    roles: ['system-admin'],
    state: 'active',
  },
};

describe('ContextService', () => {
  it('preserves end-user routes when switching from personal to organization', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ContextService);
    service.applySessionSnapshot(sessionWithOrgAndSystem);

    expect(service.resolveRouteForContext('org:org-1', '/calendar')).toBe('/calendar');
  });

  it('falls back to the system landing route for system-only areas', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ContextService);
    service.applySessionSnapshot(sessionWithOrgAndSystem);

    expect(service.resolveRouteForContext('system', '/calendar')).toBe('/admin/setup');
  });
});
