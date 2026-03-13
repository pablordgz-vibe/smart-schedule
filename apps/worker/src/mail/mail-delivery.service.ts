import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { DatabaseService } from '../persistence/database.service';

type PendingMailMessage = {
  attempts: number;
  body: string;
  id: string;
  recipientEmail: string;
  subject: string;
};

type SmtpTransportConfig = {
  fromAddress: string;
  transportKind: string;
  transportOptions: string | Record<string, unknown>;
};

@Injectable()
export class MailDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailDeliveryService.name);
  private readonly pollIntervalMs = readPositiveIntegerEnv('MAIL_POLL_INTERVAL_MS', 5000);
  private readonly maxAttempts = readPositiveIntegerEnv('MAIL_MAX_ATTEMPTS', 5);
  private readonly processingTimeoutMs = readPositiveIntegerEnv(
    'MAIL_PROCESSING_TIMEOUT_MS',
    300000,
  );
  private readonly fallbackFromAddress =
    process.env['MAIL_FROM_ADDRESS']?.trim() || 'no-reply@smart-schedule.local';
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit() {
    void this.processQueue();
    this.timer = setInterval(() => {
      void this.processQueue();
    }, this.pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      for (;;) {
        const message = await this.claimNextMessage();
        if (!message) {
          break;
        }

        try {
          const transport = await this.loadTransportConfig();
          const textBody = this.extractTextBody(message.body);
          const transporter = nodemailer.createTransport(
            transport.transportOptions as Parameters<typeof nodemailer.createTransport>[0],
          );
          await transporter.sendMail({
            from: transport.fromAddress,
            subject: message.subject,
            text: textBody,
            to: message.recipientEmail,
          });
          await this.databaseService.query(
            `update mail_outbox
             set delivered_at = now(),
                 failed_at = null,
                 failure_reason = null,
                 processing_started_at = null,
                 transport = $2
             where id = $1`,
            [message.id, transport.transportKind],
          );
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message.slice(0, 500) : 'Unknown mail delivery error.';
          this.logger.error(`Failed to deliver mail ${message.id}: ${messageText}`);
          await this.databaseService.query(
            `update mail_outbox
             set failed_at = now(),
                 failure_reason = $2,
                 processing_started_at = null
             where id = $1`,
            [message.id, messageText],
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async claimNextMessage(): Promise<PendingMailMessage | null> {
    const pool = this.databaseService.getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<{
        attempts: number;
        body: string;
        id: string;
        recipient_email: string;
        subject: string;
      }>(
        `select id, subject, recipient_email, body, attempts
         from mail_outbox
         where expires_at > now()
           and delivered_at is null
           and attempts < $1
           and (
             processing_started_at is null
             or processing_started_at < now() - ($2 * interval '1 millisecond')
           )
         order by created_at asc
         for update skip locked
         limit 1`,
        [this.maxAttempts, this.processingTimeoutMs],
      );

      const row = result.rows[0];
      if (!row) {
        await client.query('commit');
        return null;
      }

      await client.query(
        `update mail_outbox
         set attempts = attempts + 1,
             last_attempt_at = now(),
             processing_started_at = now()
         where id = $1`,
        [row.id],
      );
      await client.query('commit');

      return {
        attempts: row.attempts + 1,
        body: row.body,
        id: row.id,
        recipientEmail: row.recipient_email,
        subject: row.subject,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadTransportConfig(): Promise<SmtpTransportConfig> {
    const result = await this.databaseService.query<{ credentials: Record<string, string> }>(
      `select credentials
       from setup_integrations
       where code = 'smtp'
         and enabled = true
       limit 1`,
    );
    const secret = result.rows[0]?.credentials?.secret?.trim();
    if (!secret) {
      throw new Error('SMTP integration is not configured.');
    }

    return parseSmtpTransportConfig(secret, this.fallbackFromAddress);
  }

  private extractTextBody(body: string) {
    const lines = body.split('\n');
    const separatorIndex = lines.findIndex((line) => line.trim() === '');
    return separatorIndex >= 0 ? lines.slice(separatorIndex + 1).join('\n').trim() : body.trim();
  }
}

export function parseSmtpTransportConfig(
  secret: string,
  fallbackFromAddress: string,
): SmtpTransportConfig {
  const trimmed = secret.trim();

  if (trimmed === 'json-transport') {
    return {
      fromAddress: fallbackFromAddress,
      transportKind: 'json-transport',
      transportOptions: { jsonTransport: true },
    };
  }

  if (trimmed === 'stream-transport') {
    return {
      fromAddress: fallbackFromAddress,
      transportKind: 'stream-transport',
      transportOptions: { buffer: true, streamTransport: true },
    };
  }

  if (trimmed.startsWith('smtp://') || trimmed.startsWith('smtps://')) {
    return {
      fromAddress: fallbackFromAddress,
      transportKind: 'smtp',
      transportOptions: trimmed,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error(
      'SMTP secret must be an SMTP URI or JSON transport configuration.',
    );
  }

  if (typeof parsed['url'] === 'string' && parsed['url'].trim()) {
    return {
      fromAddress:
        typeof parsed['fromAddress'] === 'string' && parsed['fromAddress'].trim()
          ? parsed['fromAddress'].trim()
          : fallbackFromAddress,
      transportKind: 'smtp',
      transportOptions: parsed['url'].trim(),
    };
  }

  if (parsed['jsonTransport'] === true) {
    return {
      fromAddress:
        typeof parsed['fromAddress'] === 'string' && parsed['fromAddress'].trim()
          ? parsed['fromAddress'].trim()
          : fallbackFromAddress,
      transportKind: 'json-transport',
      transportOptions: { jsonTransport: true },
    };
  }

  const host = typeof parsed['host'] === 'string' ? parsed['host'].trim() : '';
  const port =
    typeof parsed['port'] === 'number'
      ? parsed['port']
      : typeof parsed['port'] === 'string'
        ? Number(parsed['port'])
        : NaN;
  if (!host || !Number.isFinite(port)) {
    throw new Error('SMTP JSON configuration must include valid host and port values.');
  }

  const authCandidate =
    parsed['auth'] && typeof parsed['auth'] === 'object' ? (parsed['auth'] as Record<string, unknown>) : null;
  const auth =
    authCandidate &&
    typeof authCandidate['user'] === 'string' &&
    typeof authCandidate['pass'] === 'string'
      ? {
          pass: authCandidate['pass'],
          user: authCandidate['user'],
        }
      : undefined;

  return {
    fromAddress:
      typeof parsed['fromAddress'] === 'string' && parsed['fromAddress'].trim()
        ? parsed['fromAddress'].trim()
        : fallbackFromAddress,
    transportKind: 'smtp',
    transportOptions: {
      auth,
      host,
      port,
      secure: Boolean(parsed['secure']),
    },
  };
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
