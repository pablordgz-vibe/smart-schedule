import { Injectable } from '@nestjs/common';
import type { SessionRecord } from '@smart-schedule/contracts';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { IdentityService } from '../identity/identity.service';
import { DatabaseService } from '../persistence/database.service';

type CreateSessionInput = {
  actorId: string;
  context: SessionRecord['context'];
};

const SESSION_COOKIE_SIGNATURE_DELIMITER = '.';

function now() {
  return Date.now();
}

@Injectable()
export class SessionService {
  private readonly sessionTtlMs =
    getNumberEnv('SESSION_TTL_SECONDS', 43_200) * 1000;
  private readonly sessionSecret = getStringEnv(
    'SESSION_SECRET',
    'development-session-secret-must-change-0001',
  );

  constructor(
    private readonly identityService: IdentityService,
    private readonly databaseService: DatabaseService,
  ) {}

  async createSession(input: CreateSessionInput) {
    const actor = await this.identityService.buildSessionActor(input.actorId);
    if (!actor) {
      throw new Error(
        `Cannot create a session for unknown actor ${input.actorId}.`,
      );
    }

    const sessionId = randomUUID();
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(now() + this.sessionTtlMs).toISOString();
    const record: SessionRecord = {
      actor,
      context: input.context,
      createdAt: timestamp,
      csrfToken: randomUUID(),
      expiresAt,
      id: sessionId,
      lastSeenAt: timestamp,
      revokedAt: null,
    };

    await this.databaseService.query(
      `insert into sessions (
         id,
         actor_id,
         context_id,
         context_tenant_id,
         context_type,
         created_at,
         csrf_token,
         expires_at,
         last_seen_at,
         revoked_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.id,
        record.actor.id,
        record.context.id,
        record.context.tenantId,
        record.context.type,
        record.createdAt,
        record.csrfToken,
        record.expiresAt,
        record.lastSeenAt,
        record.revokedAt,
      ],
    );

    return {
      cookieValue: this.signSessionId(sessionId),
      session: record,
    };
  }

  async resolveSession(cookieValue: string | null) {
    if (!cookieValue) {
      return null;
    }

    const sessionId = this.verifySessionCookie(cookieValue);
    if (!sessionId) {
      return null;
    }

    const existing = await this.loadSessionRecord(sessionId);
    if (!existing || existing.revokedAt) {
      return null;
    }

    const actor = await this.identityService.buildSessionActor(
      existing.actor.id,
    );
    if (
      !actor ||
      existing.revokedAt ||
      actor.state !== 'active' ||
      new Date(existing.expiresAt).getTime() <= now()
    ) {
      return null;
    }

    const refreshed: SessionRecord = {
      ...existing,
      actor,
      lastSeenAt: new Date().toISOString(),
    };

    await this.databaseService.query(
      `update sessions
       set last_seen_at = $2
       where id = $1`,
      [sessionId, refreshed.lastSeenAt],
    );
    return refreshed;
  }

  revokeSession(cookieValue: string | null) {
    if (!cookieValue) {
      return false;
    }

    const sessionId = this.verifySessionCookie(cookieValue);
    if (!sessionId) {
      return false;
    }

    return this.revokeSessionById(sessionId);
  }

  async revokeSessionById(sessionId: string) {
    const result = await this.databaseService.query(
      `update sessions
       set revoked_at = $2
       where id = $1
         and revoked_at is null`,
      [sessionId, new Date().toISOString()],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeActorSessions(actorId: string) {
    const result = await this.databaseService.query(
      `update sessions
       set revoked_at = $2
       where actor_id = $1
         and revoked_at is null`,
      [actorId, new Date().toISOString()],
    );
    return result.rowCount ?? 0;
  }

  async clearAll() {
    await this.databaseService.query('delete from sessions');
  }

  private signSessionId(sessionId: string) {
    return `${sessionId}${SESSION_COOKIE_SIGNATURE_DELIMITER}${this.createSignature(sessionId)}`;
  }

  private verifySessionCookie(cookieValue: string) {
    const [sessionId, signature] = cookieValue.split(
      SESSION_COOKIE_SIGNATURE_DELIMITER,
    );
    if (!sessionId || !signature) {
      return null;
    }

    const expectedSignature = this.createSignature(sessionId);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (actualBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
      return null;
    }

    return sessionId;
  }

  private createSignature(sessionId: string) {
    return createHmac('sha256', this.sessionSecret)
      .update(sessionId)
      .digest('base64url');
  }

  private async loadSessionRecord(
    sessionId: string,
  ): Promise<SessionRecord | null> {
    const result = await this.databaseService.query<{
      actor_id: string;
      context_id: string | null;
      context_tenant_id: string | null;
      context_type: SessionRecord['context']['type'];
      created_at: Date | string;
      csrf_token: string;
      expires_at: Date | string;
      id: string;
      last_seen_at: Date | string;
      revoked_at: Date | string | null;
    }>(
      `select
         actor_id,
         context_id,
         context_tenant_id,
         context_type,
         created_at,
         csrf_token,
         expires_at,
         id,
         last_seen_at,
         revoked_at
       from sessions
       where id = $1`,
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const actor = await this.identityService.buildSessionActor(row.actor_id);
    if (!actor) {
      return null;
    }

    return {
      actor,
      context: {
        id: row.context_id,
        tenantId: row.context_tenant_id,
        type: row.context_type,
      },
      createdAt: toIsoString(row.created_at),
      csrfToken: row.csrf_token,
      expiresAt: toIsoString(row.expires_at),
      id: row.id,
      lastSeenAt: toIsoString(row.last_seen_at),
      revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null,
    };
  }
}

function getNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStringEnv(name: string, fallback: string) {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function toIsoString(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
