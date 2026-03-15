import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStateService } from '../auth-state.service';
import { SetupStateService } from './setup-state.service';
import type {
  AdminIntegrationSnapshot,
  MailOutboxSummary,
  SetupBootstrapPayload,
  SetupIntegrationProvider,
  SetupStateSnapshot,
} from './setup.types';

const inProgressState: SetupStateSnapshot = {
  admin: {
    createdAt: '2026-03-11T00:00:00.000Z',
    email: 'admin@example.com',
    id: 'admin-1',
    name: 'Initial Admin',
    role: 'system-admin',
  },
  completedAt: null,
  configuredIntegrations: [],
  edition: 'community',
  isComplete: false,
  step: 'integrations',
};

const completeState: SetupStateSnapshot = {
  ...inProgressState,
  completedAt: '2026-03-12T00:00:00.000Z',
  isComplete: true,
  step: 'complete',
};

const integrationProviders: SetupIntegrationProvider[] = [
  {
    category: 'email',
    code: 'smtp',
    credentialModes: ['api-key'],
    description: 'Deliver transactional email.',
    displayName: 'SMTP',
  },
];

const bootstrapPayload: SetupBootstrapPayload = {
  admin: {
    email: 'admin@example.com',
    name: 'Initial Admin',
    password: 'password-123',
  },
  integrations: [
    {
      code: 'smtp',
      credentials: { secret: 'json-transport' },
      enabled: true,
      mode: 'api-key',
    },
  ],
};

const adminIntegrations: AdminIntegrationSnapshot = {
  configuredIntegrations: [
    {
      code: 'smtp',
      enabled: true,
      hasCredentials: true,
      mode: 'api-key',
      updatedAt: '2026-03-12T00:00:00.000Z',
    },
  ],
  edition: 'community',
  providers: integrationProviders,
};

const outboxMessages: MailOutboxSummary[] = [
  {
    attempts: 1,
    createdAt: '2026-03-12T00:00:00.000Z',
    deliveredAt: null,
    expiresAt: '2026-03-19T00:00:00.000Z',
    failedAt: null,
    failureReason: null,
    id: 'mail-1',
    kind: 'invite',
    lastAttemptAt: null,
    recipientEmail: 'user@example.com',
    status: 'queued',
    subject: 'Invitation',
    transport: 'json-transport',
  },
];

describe('SetupStateService', () => {
  let service: SetupStateService;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        SetupStateService,
        {
          provide: AuthStateService,
          useValue: {
            csrfToken: signal('csrf-token'),
          },
        },
      ],
    });

    service = TestBed.inject(SetupStateService);
  });

  it('loads the complete bootstrap state without fetching the setup wizard payloads', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ edition: 'community', isComplete: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );

    await service.load();

    expect(service.snapshot()).toEqual({
      admin: null,
      completedAt: null,
      configuredIntegrations: [],
      edition: 'community',
      isComplete: true,
      step: 'complete',
    });
    expect(service.integrationProviders()).toEqual([]);
    expect(service.isLoaded()).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('loads in-progress setup state and integration options', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ edition: 'community', isComplete: false }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(inProgressState), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ edition: 'community', providers: integrationProviders }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    await service.load();

    expect(service.snapshot()).toEqual(inProgressState);
    expect(service.integrationProviders()).toEqual(integrationProviders);
    expect(service.edition()).toBe('community');
    expect(service.isComplete()).toBe(false);
    expect(service.loadError()).toBeNull();
  });

  it('clears state and exposes load errors for invalid setup payloads', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ edition: 'community', isComplete: false }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ edition: 'community' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    await service.load();

    expect(service.snapshot()).toBeNull();
    expect(service.integrationProviders()).toEqual([]);
    expect(service.loadError()).toBe('Setup state payload is invalid.');
  });

  it('posts bootstrap completion and stores the returned setup snapshot', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ state: completeState }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );

    await expect(service.completeSetup(bootstrapPayload)).resolves.toEqual(completeState);
    expect(service.snapshot()).toEqual(completeState);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/setup/complete',
      expect.objectContaining({
        body: JSON.stringify(bootstrapPayload),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    );
  });

  it('uses csrf headers for admin integration reads and writes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(adminIntegrations), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(adminIntegrations), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    await expect(service.loadAdminIntegrations()).resolves.toEqual(adminIntegrations);
    await expect(service.saveAdminIntegrations(bootstrapPayload.integrations)).resolves.toEqual(
      adminIntegrations,
    );

    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(1, '/api/admin/global-integrations', {
      credentials: 'include',
      headers: {
        'x-csrf-token': 'csrf-token',
      },
    });
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(2, '/api/admin/global-integrations', {
      body: JSON.stringify({ integrations: bootstrapPayload.integrations }),
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      method: 'PATCH',
    });
  });

  it('loads the mail outbox and surfaces API failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: outboxMessages }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'No access' } }), {
          headers: { 'content-type': 'application/json' },
          status: 403,
        }),
      );

    await expect(service.loadMailOutbox()).resolves.toEqual(outboxMessages);
    await expect(service.loadMailOutbox()).rejects.toThrow('No access');
  });

  it('surfaces setup completion failures with the API error message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Setup completion failed.' } }), {
        headers: { 'content-type': 'application/json' },
        status: 400,
      }),
    );

    await expect(service.completeSetup(bootstrapPayload)).rejects.toThrow(
      'Setup completion failed.',
    );
  });
});
