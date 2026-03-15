import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import {
  MailDeliveryService,
  parseSmtpTransportConfig,
} from './mail-delivery.service';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

beforeEach(() => {
  delete process.env.MAIL_POLL_INTERVAL_MS;
  delete process.env.MAIL_MAX_ATTEMPTS;
  delete process.env.MAIL_PROCESSING_TIMEOUT_MS;
  delete process.env.MAIL_FROM_ADDRESS;
  vi.restoreAllMocks();
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  vi.mocked(nodemailer.createTransport).mockReset();
});

describe('parseSmtpTransportConfig', () => {
  it('accepts smtp urls', () => {
    const config = parseSmtpTransportConfig(
      'smtp://user:pass@mail.example.com:587',
      'no-reply@example.com',
    );

    expect(config.transportKind).toBe('smtp');
    expect(config.transportOptions).toBe(
      'smtp://user:pass@mail.example.com:587',
    );
  });

  it('accepts JSON smtp configuration', () => {
    const config = parseSmtpTransportConfig(
      JSON.stringify({
        auth: { pass: 'pass', user: 'user' },
        fromAddress: 'mailer@example.com',
        host: 'mail.example.com',
        port: 587,
        secure: false,
      }),
      'no-reply@example.com',
    );

    expect(config.fromAddress).toBe('mailer@example.com');
    expect(config.transportKind).toBe('smtp');
  });

  it('supports built-in transport shorthands and JSON url mode', () => {
    expect(
      parseSmtpTransportConfig('json-transport', 'fallback@example.com'),
    ).toEqual({
      fromAddress: 'fallback@example.com',
      transportKind: 'json-transport',
      transportOptions: { jsonTransport: true },
    });

    expect(
      parseSmtpTransportConfig('stream-transport', 'fallback@example.com'),
    ).toEqual({
      fromAddress: 'fallback@example.com',
      transportKind: 'stream-transport',
      transportOptions: { buffer: true, streamTransport: true },
    });

    expect(
      parseSmtpTransportConfig(
        JSON.stringify({
          fromAddress: 'ops@example.com',
          url: 'smtps://user:pass@mail.example.com:465',
        }),
        'fallback@example.com',
      ),
    ).toEqual({
      fromAddress: 'ops@example.com',
      transportKind: 'smtp',
      transportOptions: 'smtps://user:pass@mail.example.com:465',
    });

    expect(
      parseSmtpTransportConfig(
        JSON.stringify({
          jsonTransport: true,
        }),
        'fallback@example.com',
      ),
    ).toEqual({
      fromAddress: 'fallback@example.com',
      transportKind: 'json-transport',
      transportOptions: { jsonTransport: true },
    });
  });

  it('rejects malformed smtp secrets', () => {
    expect(() =>
      parseSmtpTransportConfig('not-valid', 'fallback@example.com'),
    ).toThrow(
      'SMTP secret must be an SMTP URI or JSON transport configuration.',
    );

    expect(() =>
      parseSmtpTransportConfig(
        JSON.stringify({
          host: 'mail.example.com',
        }),
        'fallback@example.com',
      ),
    ).toThrow(
      'SMTP JSON configuration must include valid host and port values.',
    );
  });
});

describe('MailDeliveryService', () => {
  function createService(options?: {
    integrationRows?: Array<{
      credentials: Record<string, string>;
      enabled: boolean;
    }>;
    outboxRows?: Array<{
      attempts: number;
      body: string;
      id: string;
      recipient_email: string;
      subject: string;
    }>;
    sendMailError?: Error;
  }) {
    const integrationRows = options?.integrationRows ?? [
      {
        credentials: { secret: 'json-transport' },
        enabled: true,
      },
    ];
    const outboxRows = [...(options?.outboxRows ?? [])];
    const clientQuery = vi.fn((text: string) => {
      if (text === 'begin' || text === 'commit' || text === 'rollback') {
        return { rows: [] };
      }

      if (text.includes('from mail_outbox')) {
        const row = outboxRows.shift();
        return { rows: row ? [row] : [] };
      }

      return { rows: [] };
    });
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({
      query: clientQuery,
      release,
    });
    const query = vi.fn((text: string) => {
      if (text.includes('from setup_integrations')) {
        return { rows: integrationRows };
      }

      return { rows: [] };
    });
    const databaseService = {
      getPool: () => ({
        connect,
      }),
      query,
    } as never;
    const sendMail = options?.sendMailError
      ? vi.fn().mockRejectedValue(options.sendMailError)
      : vi.fn().mockResolvedValue(undefined);

    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    const service = new MailDeliveryService(databaseService);
    return {
      clientQuery,
      connect,
      databaseService,
      query,
      release,
      sendMail,
      service,
    };
  }

  it('delivers pending messages and records the chosen transport', async () => {
    const { clientQuery, query, sendMail, service } = createService({
      outboxRows: [
        {
          attempts: 0,
          body: 'Subject: Invite\n\nPlain-text body',
          id: 'mail-1',
          recipient_email: 'user@example.com',
          subject: 'Invitation',
        },
      ],
    });

    await service.processQueue();

    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@smart-schedule.local',
      subject: 'Invitation',
      text: 'Plain-text body',
      to: 'user@example.com',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('set delivered_at = now()'),
      ['mail-1', 'json-transport'],
    );
    expect(clientQuery).toHaveBeenCalledWith('begin');
    expect(clientQuery).toHaveBeenCalledWith('commit');
  });

  it('marks failed deliveries and resets the processing flag', async () => {
    const error = new Error('SMTP rejected the message');
    const { query, service } = createService({
      outboxRows: [
        {
          attempts: 1,
          body: 'body only',
          id: 'mail-2',
          recipient_email: 'user@example.com',
          subject: 'Reminder',
        },
      ],
      sendMailError: error,
    });

    await service.processQueue();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('set failed_at = now()'),
      ['mail-2', 'SMTP rejected the message'],
    );
    expect((service as unknown as { processing: boolean }).processing).toBe(
      false,
    );
  });

  it('avoids concurrent queue processing and honours configured poll intervals', () => {
    process.env.MAIL_POLL_INTERVAL_MS = '9000';
    const { connect, service } = createService();
    const processSpy = vi
      .spyOn(service, 'processQueue')
      .mockResolvedValue(undefined);
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue(123 as unknown as NodeJS.Timeout);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    (service as unknown as { processing: boolean }).processing = true;

    void service.processQueue();
    service.onModuleInit();
    service.onModuleDestroy();

    expect(connect).not.toHaveBeenCalled();
    expect(processSpy).toHaveBeenCalledTimes(2);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 9000);
    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
  });

  it('surfaces missing smtp integration credentials', async () => {
    const { service } = createService({
      integrationRows: [{ credentials: {}, enabled: true }],
      outboxRows: [
        {
          attempts: 0,
          body: 'body only',
          id: 'mail-3',
          recipient_email: 'user@example.com',
          subject: 'Reminder',
        },
      ],
    });

    await service.processQueue();

    expect(vi.mocked(nodemailer.createTransport)).not.toHaveBeenCalled();
  });
});
