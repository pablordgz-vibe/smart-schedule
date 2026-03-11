import { Injectable } from '@nestjs/common';
import type { AccountState, SessionRecord } from '@smart-schedule/contracts';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { IdentityService } from '../identity/identity.service';

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
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly sessionTtlMs = getNumberEnv('SESSION_TTL_SECONDS', 43_200) * 1000;
  private readonly sessionSecret = getStringEnv(
    'SESSION_SECRET',
    'development-session-secret-must-change-0001',
  );

  constructor(private readonly identityService: IdentityService) {}

  async createSession(input: CreateSessionInput) {
    const actor = await this.identityService.buildSessionActor(input.actorId);
    if (!actor) {
      throw new Error(`Cannot create a session for unknown actor ${input.actorId}.`);
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

    this.sessions.set(sessionId, record);

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

    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    const actor = await this.identityService.buildSessionActor(existing.actor.id);
    if (!actor || existing.revokedAt || actor.state !== 'active' || new Date(existing.expiresAt).getTime() <= now()) {
      return null;
    }

    const refreshed: SessionRecord = {
      ...existing,
      actor,
      lastSeenAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, refreshed);
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

  revokeSessionById(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (!existing || existing.revokedAt) {
      return false;
    }

    this.sessions.set(sessionId, {
      ...existing,
      revokedAt: new Date().toISOString(),
    });
    return true;
  }

  revokeActorSessions(actorId: string) {
    let revokedSessions = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.actor.id !== actorId || session.revokedAt) {
        continue;
      }

      revokedSessions += 1;
      this.sessions.set(sessionId, {
        ...session,
        actor: {
          ...session.actor,
          state: 'deactivated' satisfies AccountState,
        },
        revokedAt: new Date().toISOString(),
      });
    }

    return revokedSessions;
  }

  clearAll() {
    this.sessions.clear();
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
