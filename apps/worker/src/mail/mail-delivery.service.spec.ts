import { describe, expect, it } from 'vitest';
import { parseSmtpTransportConfig } from './mail-delivery.service';

describe('parseSmtpTransportConfig', () => {
  it('accepts smtp urls', () => {
    const config = parseSmtpTransportConfig(
      'smtp://user:pass@mail.example.com:587',
      'no-reply@example.com',
    );

    expect(config.transportKind).toBe('smtp');
    expect(config.transportOptions).toBe('smtp://user:pass@mail.example.com:587');
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
});
