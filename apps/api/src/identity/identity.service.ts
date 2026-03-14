import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccountState,
  AuthConfigurationSnapshot,
  AuthMethodSummary,
  IdentityUserSummary,
  SessionActor,
  SocialProviderCode,
  UserSettingsSnapshot,
} from '@smart-schedule/contracts';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../persistence/database.service';
import { AuditService } from '../security/audit.service';
import { OAuthService } from './oauth.service';
import { socialProviderCatalog } from './social-provider.catalog';

type TokenKind = 'account-recovery' | 'email-verification' | 'password-reset';

type MailMessageKind =
  | 'account-recovery'
  | 'email-verification'
  | 'password-reset';

type LinkedSocialIdentity = {
  linkedAt: string;
  provider: SocialProviderCode;
  providerSubject: string;
};

type PersistedUserRecord = {
  adminTier: number | null;
  createdAt: string;
  deletedAt: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  linkedSocialIdentities: LinkedSocialIdentity[];
  name: string;
  passwordHash: string | null;
  recoverUntil: string | null;
  roles: string[];
  state: AccountState;
  updatedAt: string;
};

type PersistedTokenRecord = {
  consumedAt: string | null;
  createdAt: string;
  expiresAt: string;
  id: string;
  kind: TokenKind;
  tokenHash: string;
  userId: string;
};

type PersistedIdentityState = {
  config: {
    minAdminTierForAccountDeactivation: number;
    requireEmailVerification: boolean;
    supportedSocialProviders: SocialProviderCode[];
  };
  tokens: PersistedTokenRecord[];
  users: PersistedUserRecord[];
};

type PersistedMailMessage = {
  body: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  kind: MailMessageKind;
  subject: string;
  to: string;
};

type RegisterPasswordInput = {
  email: string;
  name: string;
  password: string;
};

type SocialSignInInput = {
  email: string;
  name: string;
  provider: SocialProviderCode;
  providerSubject: string;
};

type TokenIssueResult = {
  expiresAt: string;
  previewToken: string | null;
};

type UpdateUserSettingsInput = {
  locale?: string;
  timeFormat?: '12h' | '24h';
  timezone?: string;
  weekStartsOn?: 'monday' | 'sunday';
};

const recoveryWindowMs = 30 * 24 * 60 * 60 * 1000;
const emailVerificationTtlMs = 24 * 60 * 60 * 1000;
const passwordResetTtlMs = 60 * 60 * 1000;
const accountRecoveryTtlMs = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url');
}

function encodePasswordHash(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const derivedKey = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt:${salt}:${derivedKey}`;
}

function verifyPasswordHash(password: string, encodedHash: string) {
  const [algorithm, salt, expectedHash] = encodedHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHash) {
    return false;
  }

  const actualBuffer = Buffer.from(
    scryptSync(password, salt, 64).toString('base64url'),
  );
  const expectedBuffer = Buffer.from(expectedHash);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function buildTierRoles(adminTier: number | null) {
  return adminTier == null ? [] : [`system-admin:tier:${adminTier}`];
}

@Injectable()
export class IdentityService {
  private readonly mailFromAddress =
    process.env.MAIL_FROM_ADDRESS ?? 'no-reply@smart-schedule.local';

  constructor(
    private readonly auditService: AuditService,
    private readonly databaseService: DatabaseService,
    private readonly oauthService: OAuthService,
  ) {}

  async getAuthConfiguration(): Promise<AuthConfigurationSnapshot> {
    const state = await this.readState();
    return this.toAuthConfiguration(state);
  }

  async getUserSummary(userId: string): Promise<IdentityUserSummary | null> {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);
    return user ? this.toUserSummary(user) : null;
  }

  async getUserSummaryByEmail(
    email: string,
  ): Promise<IdentityUserSummary | null> {
    const state = await this.readState();
    const user = state.users.find(
      (candidate) => candidate.email === normalizeEmail(email),
    );
    return user ? this.toUserSummary(user) : null;
  }

  async listUsers(input?: { query?: string }) {
    const state = await this.readState();
    const query = input?.query?.trim().toLowerCase() ?? '';

    return state.users
      .filter((user) => {
        if (!query) {
          return true;
        }

        return (
          user.email.includes(query) ||
          user.name.toLowerCase().includes(query) ||
          user.id.includes(query)
        );
      })
      .map((user) => this.toUserSummary(user))
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  async getUserSettings(userId: string): Promise<UserSettingsSnapshot> {
    await this.requireRecoverableUser(userId);

    await this.databaseService.query(
      `insert into user_settings (user_id)
       values ($1)
       on conflict (user_id) do nothing`,
      [userId],
    );

    const result = await this.databaseService.query<{
      locale: string;
      time_format: '12h' | '24h';
      timezone: string;
      week_starts_on: 'monday' | 'sunday';
    }>(
      `select locale, time_format, timezone, week_starts_on
       from user_settings
       where user_id = $1`,
      [userId],
    );

    const row = result.rows[0];
    if (!row) {
      return this.defaultUserSettings();
    }

    return {
      locale: row.locale,
      timeFormat: row.time_format,
      timezone: row.timezone,
      weekStartsOn: row.week_starts_on,
    };
  }

  async updateUserSettings(
    userId: string,
    input: UpdateUserSettingsInput,
  ): Promise<UserSettingsSnapshot> {
    await this.requireRecoverableUser(userId);

    const current = await this.getUserSettings(userId);
    const next: UserSettingsSnapshot = {
      locale: input.locale?.trim() || current.locale,
      timeFormat: input.timeFormat ?? current.timeFormat,
      timezone: input.timezone?.trim() || current.timezone,
      weekStartsOn: input.weekStartsOn ?? current.weekStartsOn,
    };

    await this.databaseService.query(
      `insert into user_settings (
         user_id,
         locale,
         time_format,
         timezone,
         week_starts_on,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id)
       do update set
         locale = excluded.locale,
         time_format = excluded.time_format,
         timezone = excluded.timezone,
         week_starts_on = excluded.week_starts_on,
         updated_at = excluded.updated_at`,
      [
        userId,
        next.locale,
        next.timeFormat,
        next.timezone,
        next.weekStartsOn,
        nowIso(),
      ],
    );

    this.auditService.emit({
      action: 'identity.settings.updated',
      details: next,
      targetId: userId,
      targetType: 'user',
    });

    return next;
  }

  async createInitialAdmin(input: RegisterPasswordInput) {
    const user = await this.databaseService.transaction((client) =>
      this.createInitialAdminInTransaction(client, input),
    );
    this.auditService.emit({
      action: 'identity.admin.bootstrap_created',
      details: {
        adminTier: user.adminTier,
      },
      targetId: user.id,
      targetType: 'user',
    });

    return this.toUserSummary(user);
  }

  async createInitialAdminInTransaction(
    client: Pick<PoolClient, 'query'>,
    input: RegisterPasswordInput,
  ) {
    const existingAdmin = await client.query<{ exists: boolean }>(
      `select exists(
         select 1
         from users
         where roles @> array['system-admin']::text[]
       ) as exists`,
    );
    if (existingAdmin.rows[0]?.exists) {
      throw new ConflictException('A system administrator already exists.');
    }

    const user = this.createUserRecord({
      adminTier: 0,
      email: input.email,
      emailVerified: true,
      name: input.name,
      password: input.password,
      roles: ['system-admin', ...buildTierRoles(0)],
    });

    await client.query(
      `insert into users (
         id,
         admin_tier,
         created_at,
         deleted_at,
         email,
         email_verified,
         name,
         password_hash,
         recover_until,
         roles,
         state,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        user.id,
        user.adminTier,
        user.createdAt,
        user.deletedAt,
        user.email,
        user.emailVerified,
        user.name,
        user.passwordHash,
        user.recoverUntil,
        user.roles,
        user.state,
        user.updatedAt,
      ],
    );

    return user;
  }

  async ensureTestUser(input: {
    actorId: string;
    adminTier?: number | null;
    email?: string;
    name?: string;
    roles?: string[];
    state?: AccountState;
  }) {
    const state = await this.readState();
    const existing = state.users.find((user) => user.id === input.actorId);
    if (existing) {
      return this.toUserSummary(existing);
    }

    const adminTier =
      input.adminTier ?? this.extractAdminTier(input.roles ?? []);
    const roles = input.roles ?? ['user'];
    const user: PersistedUserRecord = {
      adminTier,
      createdAt: nowIso(),
      deletedAt: null,
      email: normalizeEmail(input.email ?? `${input.actorId}@example.test`),
      emailVerified: true,
      id: input.actorId,
      linkedSocialIdentities: [],
      name: input.name ?? input.actorId,
      passwordHash: encodePasswordHash('test-password-not-for-login'),
      recoverUntil: null,
      roles:
        adminTier == null
          ? roles
          : [...new Set([...roles, ...buildTierRoles(adminTier)])],
      state: input.state ?? 'active',
      updatedAt: nowIso(),
    };

    state.users.push(user);
    await this.writeState(state);
    return this.toUserSummary(user);
  }

  async registerPasswordUser(input: RegisterPasswordInput) {
    const state = await this.readState();
    const email = normalizeEmail(input.email);
    if (state.users.some((user) => user.email === email)) {
      throw new ConflictException('An account with that email already exists.');
    }

    const user = this.createUserRecord({
      adminTier: null,
      email,
      emailVerified: false,
      name: input.name,
      password: input.password,
      roles: ['user'],
    });

    state.users.push(user);
    const tokenDelivery = this.issueToken(
      state,
      user.id,
      'email-verification',
      emailVerificationTtlMs,
    );
    await this.queueMailMessage({
      email: user.email,
      expiresAt: tokenDelivery.expiresAt,
      kind: 'email-verification',
      previewToken: tokenDelivery.previewToken,
    });
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.account.registered',
      details: {
        requiresEmailVerification: state.config.requireEmailVerification,
      },
      targetId: user.id,
      targetType: 'user',
    });

    return {
      tokenDelivery,
      user: this.toUserSummary(user),
    };
  }

  async authenticatePassword(email: string, password: string) {
    const state = await this.readState();
    const user = state.users.find(
      (candidate) => candidate.email === normalizeEmail(email),
    );
    if (
      !user ||
      !user.passwordHash ||
      !verifyPasswordHash(password, user.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.assertAccountCanAuthenticate(
      user,
      state.config.requireEmailVerification,
    );
    return this.toUserSummary(user);
  }

  async requestEmailVerification(email: string) {
    const state = await this.readState();
    const user = state.users.find(
      (candidate) => candidate.email === normalizeEmail(email),
    );
    if (!user || user.state !== 'active' || user.emailVerified) {
      return { expiresAt: null, previewToken: null };
    }

    const tokenDelivery = this.issueToken(
      state,
      user.id,
      'email-verification',
      emailVerificationTtlMs,
    );
    await this.queueMailMessage({
      email: user.email,
      expiresAt: tokenDelivery.expiresAt,
      kind: 'email-verification',
      previewToken: tokenDelivery.previewToken,
    });
    await this.writeState(state);
    return tokenDelivery;
  }

  async confirmEmailVerification(token: string) {
    const state = await this.readState();
    const user = this.consumeToken(state, token, 'email-verification');
    user.emailVerified = true;
    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.email.verified',
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async requestPasswordReset(email: string) {
    const state = await this.readState();
    const user = state.users.find(
      (candidate) => candidate.email === normalizeEmail(email),
    );
    if (!user || user.state !== 'active' || !user.passwordHash) {
      return { expiresAt: null, previewToken: null };
    }

    const tokenDelivery = this.issueToken(
      state,
      user.id,
      'password-reset',
      passwordResetTtlMs,
    );
    await this.queueMailMessage({
      email: user.email,
      expiresAt: tokenDelivery.expiresAt,
      kind: 'password-reset',
      previewToken: tokenDelivery.previewToken,
    });
    await this.writeState(state);
    return tokenDelivery;
  }

  async confirmPasswordReset(token: string, password: string) {
    const state = await this.readState();
    const user = this.consumeToken(state, token, 'password-reset');
    this.assertRecoverableUser(user);
    user.passwordHash = encodePasswordHash(password);
    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.password.reset_completed',
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async getConfiguredSocialProviders() {
    const state = await this.readState();
    return this.oauthService.getAvailableProviders(
      state.config.supportedSocialProviders,
    );
  }

  async authenticateSocial(input: SocialSignInInput) {
    const state = await this.readState();
    this.assertSocialProviderConfigured(state, input.provider);

    const linkedUser = state.users.find((user) =>
      user.linkedSocialIdentities.some(
        (identity) =>
          identity.provider === input.provider &&
          identity.providerSubject === input.providerSubject,
      ),
    );

    if (linkedUser) {
      this.assertAccountCanAuthenticate(linkedUser, false);
      return this.toUserSummary(linkedUser);
    }

    const normalizedEmail = normalizeEmail(input.email);
    const existingEmailOwner = state.users.find(
      (user) => user.email === normalizedEmail,
    );
    if (existingEmailOwner) {
      throw new ConflictException(
        'This email already belongs to an existing account. Sign in first and link the provider from settings.',
      );
    }

    const user = this.createUserRecord({
      adminTier: null,
      email: normalizedEmail,
      emailVerified: true,
      name: input.name,
      password: null,
      roles: ['user'],
    });
    user.linkedSocialIdentities.push({
      linkedAt: nowIso(),
      provider: input.provider,
      providerSubject: input.providerSubject,
    });
    state.users.push(user);
    await this.writeState(state);
    return this.toUserSummary(user);
  }

  async linkSocialIdentity(
    userId: string,
    input: Omit<SocialSignInInput, 'email' | 'name'>,
  ) {
    const state = await this.readState();
    this.assertSocialProviderConfigured(state, input.provider);

    const owner = state.users.find((user) => user.id === userId);
    if (!owner) {
      throw new NotFoundException('Account not found.');
    }
    this.assertRecoverableUser(owner);

    const existingLink = state.users.find((user) =>
      user.linkedSocialIdentities.some(
        (identity) =>
          identity.provider === input.provider &&
          identity.providerSubject === input.providerSubject,
      ),
    );
    if (existingLink && existingLink.id !== owner.id) {
      throw new ConflictException(
        'That social identity is already linked to another account.',
      );
    }

    if (
      owner.linkedSocialIdentities.some(
        (identity) => identity.provider === input.provider,
      )
    ) {
      throw new ConflictException(
        'That provider is already linked to this account.',
      );
    }

    owner.linkedSocialIdentities.push({
      linkedAt: nowIso(),
      provider: input.provider,
      providerSubject: input.providerSubject,
    });
    owner.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.provider.linked',
      details: {
        provider: input.provider,
      },
      targetId: owner.id,
      targetType: 'user',
    });
    return this.toUserSummary(owner);
  }

  async unlinkSocialIdentity(userId: string, provider: SocialProviderCode) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }
    this.assertRecoverableUser(user);

    const beforeCount = user.linkedSocialIdentities.length;
    user.linkedSocialIdentities = user.linkedSocialIdentities.filter(
      (identity) => identity.provider !== provider,
    );
    if (beforeCount === user.linkedSocialIdentities.length) {
      throw new NotFoundException(
        'That provider is not linked to the account.',
      );
    }

    if (!this.hasUsableLoginMethod(user)) {
      throw new ConflictException(
        'You cannot remove the last usable authentication method from this account.',
      );
    }

    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.provider.unlinked',
      details: {
        provider,
      },
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async deleteAccount(userId: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }
    if (user.state === 'deleted' && user.recoverUntil) {
      return this.toUserSummary(user);
    }

    user.state = 'deleted';
    user.deletedAt = nowIso();
    user.recoverUntil = new Date(Date.now() + recoveryWindowMs).toISOString();
    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.account.deleted',
      details: {
        recoverUntil: user.recoverUntil,
      },
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async requestAccountRecovery(email: string) {
    const state = await this.readState();
    const user = state.users.find(
      (candidate) => candidate.email === normalizeEmail(email),
    );
    if (!user || user.state !== 'deleted' || !user.recoverUntil) {
      return { expiresAt: null, previewToken: null };
    }

    if (new Date(user.recoverUntil).getTime() <= Date.now()) {
      await this.writeState(state);
      return { expiresAt: null, previewToken: null };
    }

    const tokenDelivery = this.issueToken(
      state,
      user.id,
      'account-recovery',
      Math.min(
        accountRecoveryTtlMs,
        new Date(user.recoverUntil).getTime() - Date.now(),
      ),
    );
    await this.queueMailMessage({
      email: user.email,
      expiresAt: tokenDelivery.expiresAt,
      kind: 'account-recovery',
      previewToken: tokenDelivery.previewToken,
    });
    await this.writeState(state);
    return tokenDelivery;
  }

  async recoverAccount(token: string) {
    const state = await this.readState();
    const user = this.consumeToken(state, token, 'account-recovery');
    if (user.state !== 'deleted' || !user.recoverUntil) {
      throw new BadRequestException('This account is not recoverable.');
    }

    if (new Date(user.recoverUntil).getTime() <= Date.now()) {
      throw new BadRequestException('The account recovery window has expired.');
    }

    user.state = 'active';
    user.deletedAt = null;
    user.recoverUntil = null;
    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.account.recovered',
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async deactivateAccount(
    userId: string,
    actorId: string,
    actorRoles: string[],
  ) {
    const state = await this.readState();
    const minimumTier = state.config.minAdminTierForAccountDeactivation;
    const actorTier = this.extractAdminTier(actorRoles);
    if (!actorRoles.includes('system-admin') || actorTier < minimumTier) {
      throw new UnauthorizedException(
        'The current admin tier cannot deactivate accounts.',
      );
    }

    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    this.assertActorCanManageUser(actorId, actorTier, user);

    user.state = 'deactivated';
    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.account.deactivated',
      details: {
        actorTier,
        targetAdminTier: user.adminTier,
      },
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async reactivateAccount(
    userId: string,
    actorId: string,
    actorRoles: string[],
  ) {
    const state = await this.readState();
    const minimumTier = state.config.minAdminTierForAccountDeactivation;
    const actorTier = this.extractAdminTier(actorRoles);
    if (!actorRoles.includes('system-admin') || actorTier < minimumTier) {
      throw new UnauthorizedException(
        'The current admin tier cannot reactivate accounts.',
      );
    }

    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    this.assertActorCanManageUser(actorId, actorTier, user);

    user.state = 'active';
    user.updatedAt = nowIso();
    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.account.reactivated',
      details: {
        actorTier,
        targetAdminTier: user.adminTier,
      },
      targetId: user.id,
      targetType: 'user',
    });
    return this.toUserSummary(user);
  }

  async updateAuthConfiguration(
    input: Partial<
      Pick<
        AuthConfigurationSnapshot,
        'minAdminTierForAccountDeactivation' | 'requireEmailVerification'
      >
    >,
  ) {
    const state = await this.readState();
    if (typeof input.minAdminTierForAccountDeactivation === 'number') {
      state.config.minAdminTierForAccountDeactivation =
        input.minAdminTierForAccountDeactivation;
    }

    if (typeof input.requireEmailVerification === 'boolean') {
      state.config.requireEmailVerification = input.requireEmailVerification;
    }

    await this.writeState(state);
    this.auditService.emit({
      action: 'identity.auth.configuration_updated',
      details: {
        minAdminTierForAccountDeactivation:
          state.config.minAdminTierForAccountDeactivation,
        requireEmailVerification: state.config.requireEmailVerification,
      },
      targetId: 'identity-config',
      targetType: 'auth-configuration',
    });
    return this.toAuthConfiguration(state);
  }

  async buildSessionActor(userId: string): Promise<SessionActor | null> {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      roles: user.roles,
      state: user.state,
    };
  }

  async assertSessionEligible(userId: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }

    this.assertAccountCanAuthenticate(
      user,
      state.config.requireEmailVerification,
    );
    return this.toUserSummary(user);
  }

  private createUserRecord(input: {
    adminTier: number | null;
    email: string;
    emailVerified: boolean;
    name: string;
    password: string | null;
    roles: string[];
  }): PersistedUserRecord {
    const timestamp = nowIso();
    return {
      adminTier: input.adminTier,
      createdAt: timestamp,
      deletedAt: null,
      email: normalizeEmail(input.email),
      emailVerified: input.emailVerified,
      id: randomUUID(),
      linkedSocialIdentities: [],
      name: input.name.trim(),
      passwordHash: input.password ? encodePasswordHash(input.password) : null,
      recoverUntil: null,
      roles: input.roles,
      state: 'active',
      updatedAt: timestamp,
    };
  }

  private issueToken(
    state: PersistedIdentityState,
    userId: string,
    kind: TokenKind,
    ttlMs: number,
  ): TokenIssueResult {
    const rawToken = randomBytes(32).toString('base64url');
    state.tokens.push({
      consumedAt: null,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      id: randomUUID(),
      kind,
      tokenHash: hashToken(rawToken),
      userId,
    });

    return {
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      previewToken: process.env.NODE_ENV === 'test' ? rawToken : null,
    };
  }

  private consumeToken(
    state: PersistedIdentityState,
    rawToken: string,
    kind: TokenKind,
  ): PersistedUserRecord {
    const record = state.tokens.find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.tokenHash === hashToken(rawToken) &&
        !candidate.consumedAt &&
        new Date(candidate.expiresAt).getTime() > Date.now(),
    );

    if (!record) {
      throw new BadRequestException(
        'The provided token is invalid or expired.',
      );
    }

    const user = state.users.find(
      (candidate) => candidate.id === record.userId,
    );
    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    record.consumedAt = nowIso();
    return user;
  }

  private assertSocialProviderConfigured(
    state: PersistedIdentityState,
    provider: SocialProviderCode,
  ) {
    if (!state.config.supportedSocialProviders.includes(provider)) {
      throw new BadRequestException('That social provider is not configured.');
    }
  }

  private assertRecoverableUser(user: PersistedUserRecord) {
    if (user.state === 'deleted') {
      throw new UnauthorizedException(
        'Deleted accounts cannot perform this action.',
      );
    }
  }

  private assertAccountCanAuthenticate(
    user: PersistedUserRecord,
    requireEmailVerification: boolean,
  ) {
    if (user.state === 'deactivated') {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    if (user.state === 'deleted') {
      throw new UnauthorizedException('This account has been deleted.');
    }

    if (requireEmailVerification && user.passwordHash && !user.emailVerified) {
      throw new UnauthorizedException(
        'Email verification is required before sign-in.',
      );
    }
  }

  private assertActorCanManageUser(
    actorId: string,
    actorTier: number,
    user: PersistedUserRecord,
  ) {
    if (actorId === user.id) {
      throw new UnauthorizedException(
        'Administrators cannot manage their own account lifecycle state.',
      );
    }

    const targetTier = user.adminTier ?? this.extractAdminTier(user.roles);
    if (targetTier >= 0 && actorTier <= targetTier) {
      throw new UnauthorizedException(
        'The current admin tier cannot manage this account.',
      );
    }
  }

  private hasUsableLoginMethod(user: PersistedUserRecord) {
    return Boolean(user.passwordHash) || user.linkedSocialIdentities.length > 0;
  }

  private extractAdminTier(roles: string[]) {
    const tierRole = roles.find((role) =>
      role.startsWith('system-admin:tier:'),
    );
    if (!tierRole) {
      return roles.includes('system-admin') ? 0 : -1;
    }

    const parsed = Number(tierRole.split(':').at(-1));
    return Number.isFinite(parsed) ? parsed : -1;
  }

  private toUserSummary(user: PersistedUserRecord): IdentityUserSummary {
    const authMethods: AuthMethodSummary[] = [];
    if (user.passwordHash) {
      authMethods.push({ kind: 'password', linkedAt: user.createdAt });
    }

    for (const identity of user.linkedSocialIdentities) {
      authMethods.push({
        kind: 'social',
        linkedAt: identity.linkedAt,
        provider: identity.provider,
      });
    }

    return {
      adminTier: user.adminTier,
      authMethods,
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      name: user.name,
      recoverUntil: user.recoverUntil,
      roles: user.roles,
      state: user.state,
    };
  }

  private async toAuthConfiguration(
    state: PersistedIdentityState,
  ): Promise<AuthConfigurationSnapshot> {
    return {
      minAdminTierForAccountDeactivation:
        state.config.minAdminTierForAccountDeactivation,
      requireEmailVerification: state.config.requireEmailVerification,
      supportedSocialProviders: await this.oauthService.getAvailableProviders(
        state.config.supportedSocialProviders,
      ),
    };
  }

  private async readState(): Promise<PersistedIdentityState> {
    const [configResult, usersResult, socialResult, tokensResult] =
      await Promise.all([
        this.databaseService.query<{
          min_admin_tier_for_account_deactivation: number;
          require_email_verification: boolean;
          supported_social_providers: string[];
        }>(
          `select
             min_admin_tier_for_account_deactivation,
             require_email_verification,
             supported_social_providers
           from identity_config
           where id = 1`,
        ),
        this.databaseService.query<{
          admin_tier: number | null;
          created_at: Date | string;
          deleted_at: Date | string | null;
          email: string;
          email_verified: boolean;
          id: string;
          name: string;
          password_hash: string | null;
          recover_until: Date | string | null;
          roles: string[];
          state: AccountState;
          updated_at: Date | string;
        }>(
          `select
             admin_tier,
             created_at,
             deleted_at,
             email,
             email_verified,
             id,
             name,
             password_hash,
             recover_until,
             roles,
             state,
             updated_at
           from users`,
        ),
        this.databaseService.query<{
          linked_at: Date | string;
          provider: SocialProviderCode;
          provider_subject: string;
          user_id: string;
        }>(
          `select linked_at, provider, provider_subject, user_id
           from social_identities`,
        ),
        this.databaseService.query<{
          consumed_at: Date | string | null;
          created_at: Date | string;
          expires_at: Date | string;
          id: string;
          kind: TokenKind;
          token_hash: string;
          user_id: string;
        }>(
          `select consumed_at, created_at, expires_at, id, kind, token_hash, user_id
           from identity_tokens`,
        ),
      ]);

    const linkedByUserId = new Map<string, LinkedSocialIdentity[]>();
    for (const row of socialResult.rows) {
      const linkedIdentity: LinkedSocialIdentity = {
        linkedAt: toIsoString(row.linked_at) ?? nowIso(),
        provider: row.provider,
        providerSubject: row.provider_subject,
      };
      const existing = linkedByUserId.get(row.user_id) ?? [];
      existing.push(linkedIdentity);
      linkedByUserId.set(row.user_id, existing);
    }

    const configRow = configResult.rows[0];
    const state = {
      config: configRow
        ? {
            minAdminTierForAccountDeactivation:
              configRow.min_admin_tier_for_account_deactivation,
            requireEmailVerification: configRow.require_email_verification,
            supportedSocialProviders: this.normalizeProviderList(
              configRow.supported_social_providers,
            ),
          }
        : this.createEmptyState().config,
      tokens: tokensResult.rows.map((row) => ({
        consumedAt: toIsoString(row.consumed_at),
        createdAt: toIsoString(row.created_at) ?? nowIso(),
        expiresAt: toIsoString(row.expires_at) ?? nowIso(),
        id: row.id,
        kind: row.kind,
        tokenHash: row.token_hash,
        userId: row.user_id,
      })),
      users: usersResult.rows.map((row) => ({
        adminTier: row.admin_tier,
        createdAt: toIsoString(row.created_at) ?? nowIso(),
        deletedAt: toIsoString(row.deleted_at),
        email: row.email,
        emailVerified: row.email_verified,
        id: row.id,
        linkedSocialIdentities: linkedByUserId.get(row.id) ?? [],
        name: row.name,
        passwordHash: row.password_hash,
        recoverUntil: toIsoString(row.recover_until),
        roles: row.roles ?? [],
        state: row.state,
        updatedAt: toIsoString(row.updated_at) ?? nowIso(),
      })),
    } satisfies PersistedIdentityState;

    const serializedBeforePrune = JSON.stringify(state);
    this.pruneExpiredData(state);
    if (JSON.stringify(state) !== serializedBeforePrune) {
      await this.persistState(state);
    }

    return state;
  }

  private async writeState(state: PersistedIdentityState) {
    this.pruneExpiredData(state);
    await this.persistState(state);
  }

  private async persistState(state: PersistedIdentityState) {
    await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into identity_config (
           id,
           min_admin_tier_for_account_deactivation,
           require_email_verification,
           supported_social_providers,
           updated_at
         )
         values (1, $1, $2, $3, now())
         on conflict (id) do update
         set min_admin_tier_for_account_deactivation =
               excluded.min_admin_tier_for_account_deactivation,
             require_email_verification = excluded.require_email_verification,
             supported_social_providers = excluded.supported_social_providers,
             updated_at = now()`,
        [
          state.config.minAdminTierForAccountDeactivation,
          state.config.requireEmailVerification,
          state.config.supportedSocialProviders,
        ],
      );

      await client.query('delete from social_identities');
      await client.query('delete from identity_tokens');

      for (const user of state.users) {
        await client.query(
          `insert into users (
             id,
             admin_tier,
             created_at,
             deleted_at,
             email,
             email_verified,
             name,
             password_hash,
             recover_until,
             roles,
             state,
             updated_at
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           on conflict (id) do update
           set admin_tier = excluded.admin_tier,
               created_at = excluded.created_at,
               deleted_at = excluded.deleted_at,
               email = excluded.email,
               email_verified = excluded.email_verified,
               name = excluded.name,
               password_hash = excluded.password_hash,
               recover_until = excluded.recover_until,
               roles = excluded.roles,
               state = excluded.state,
               updated_at = excluded.updated_at`,
          [
            user.id,
            user.adminTier,
            user.createdAt,
            user.deletedAt,
            user.email,
            user.emailVerified,
            user.name,
            user.passwordHash,
            user.recoverUntil,
            user.roles,
            user.state,
            user.updatedAt,
          ],
        );

        for (const identity of user.linkedSocialIdentities) {
          await client.query(
            `insert into social_identities (
               provider,
               provider_subject,
               user_id,
               linked_at
             )
             values ($1, $2, $3, $4)`,
            [
              identity.provider,
              identity.providerSubject,
              user.id,
              identity.linkedAt,
            ],
          );
        }
      }

      const retainedUserIds = state.users.map((user) => user.id);
      await client.query(
        `delete from users u
         where not (u.id = any($1::text[]))
           and not exists (
             select 1
             from organizations o
             where o.created_by_user_id = u.id
           )
           and not exists (
             select 1
             from organization_memberships om
             where om.user_id = u.id
           )
           and not exists (
             select 1
             from organization_invitations oi
             where oi.invited_by_user_id = u.id
                or oi.accepted_by_user_id = u.id
           )
           and not exists (
             select 1
             from organization_groups og
             where og.created_by_user_id = u.id
           )
           and not exists (
             select 1
             from organization_group_members ogm
             where ogm.user_id = u.id
           )
           and not exists (
             select 1
             from organization_calendars oc
             where oc.owner_user_id = u.id
                or oc.created_by_user_id = u.id
           )
           and not exists (
             select 1
             from organization_calendar_visibility_grants ocvg
             where ocvg.user_id = u.id
                or ocvg.granted_by_user_id = u.id
           )`,
        [retainedUserIds],
      );

      for (const token of state.tokens) {
        await client.query(
          `insert into identity_tokens (
             id,
             consumed_at,
             created_at,
             expires_at,
             kind,
             token_hash,
             user_id
           )
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            token.id,
            token.consumedAt,
            token.createdAt,
            token.expiresAt,
            token.kind,
            token.tokenHash,
            token.userId,
          ],
        );
      }
    });
  }

  private pruneExpiredData(state: PersistedIdentityState) {
    const currentTime = Date.now();
    state.tokens = state.tokens.filter(
      (token) =>
        !token.consumedAt && new Date(token.expiresAt).getTime() > currentTime,
    );
    state.users = state.users.filter((user) => {
      if (user.state !== 'deleted' || !user.recoverUntil) {
        return true;
      }

      return new Date(user.recoverUntil).getTime() > currentTime;
    });
  }

  private createEmptyState(): PersistedIdentityState {
    return {
      config: {
        minAdminTierForAccountDeactivation: 0,
        requireEmailVerification: false,
        supportedSocialProviders: this.normalizeProviderList(
          process.env.AUTH_SOCIAL_PROVIDERS?.split(',') ?? [
            'google',
            'github',
            'microsoft',
          ],
        ),
      },
      tokens: [],
      users: [],
    };
  }

  private normalizeProviderList(values: string[] | undefined) {
    return Array.from(
      new Set(
        (values ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter(
            (value): value is SocialProviderCode =>
              value in socialProviderCatalog,
          ),
      ),
    );
  }

  private async queueMailMessage(input: {
    email: string;
    expiresAt: string;
    kind: MailMessageKind;
    previewToken: string | null;
  }) {
    await this.databaseService.query(
      `insert into mail_outbox (
         id,
         body,
         created_at,
         expires_at,
         kind,
         subject,
         recipient_email
       )
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        this.buildMailBody(input),
        nowIso(),
        input.expiresAt,
        input.kind,
        this.buildMailSubject(input.kind),
        input.email,
      ],
    );
  }

  private buildMailBody(input: {
    email: string;
    expiresAt: string;
    kind: MailMessageKind;
    previewToken: string | null;
  }) {
    const actionLabel =
      input.kind === 'email-verification'
        ? 'verify your email address'
        : input.kind === 'password-reset'
          ? 'reset your password'
          : 'recover your account';
    const actionUrl = input.previewToken
      ? `https://app.smart-schedule.local/${input.kind}?token=${input.previewToken}`
      : `https://app.smart-schedule.local/${input.kind}`;

    return [
      `From: ${this.mailFromAddress}`,
      `To: ${input.email}`,
      '',
      `Use the link below to ${actionLabel}.`,
      actionUrl,
      `This link expires at ${input.expiresAt}.`,
    ].join('\n');
  }

  private buildMailSubject(kind: MailMessageKind) {
    if (kind === 'email-verification') {
      return 'Verify your SmartSchedule email';
    }

    if (kind === 'password-reset') {
      return 'Reset your SmartSchedule password';
    }

    return 'Recover your SmartSchedule account';
  }

  private async readMailOutbox(): Promise<PersistedMailMessage[]> {
    const result = await this.databaseService.query<{
      body: string;
      created_at: Date | string;
      expires_at: Date | string;
      id: string;
      kind: MailMessageKind;
      subject: string;
      recipient_email: string;
    }>(
      `select
         body,
         created_at,
         expires_at,
         id,
         kind,
         subject,
         recipient_email
       from mail_outbox
       where expires_at > now()
       order by created_at asc`,
    );

    return result.rows.map((row) => ({
      body: row.body,
      createdAt: toIsoString(row.created_at) ?? nowIso(),
      expiresAt: toIsoString(row.expires_at) ?? nowIso(),
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      to: row.recipient_email,
    }));
  }

  private defaultUserSettings(): UserSettingsSnapshot {
    return {
      locale: 'en',
      timeFormat: '24h',
      timezone: 'UTC',
      weekStartsOn: 'monday',
    };
  }

  private async requireRecoverableUser(userId: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);

    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    this.assertRecoverableUser(user);
    return user;
  }
}

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
