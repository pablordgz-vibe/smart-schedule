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
  SocialProviderDescriptor,
} from '@smart-schedule/contracts';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type TokenKind = 'account-recovery' | 'email-verification' | 'password-reset';

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

const socialProviderCatalog: Record<SocialProviderCode, SocialProviderDescriptor> = {
  github: { code: 'github', displayName: 'GitHub' },
  google: { code: 'google', displayName: 'Google' },
  microsoft: { code: 'microsoft', displayName: 'Microsoft' },
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
  private readonly stateFilePath = path.resolve(
    process.cwd(),
    process.env.IDENTITY_STATE_FILE ?? '.smart-schedule/identity-state.json',
  );

  async getAuthConfiguration(): Promise<AuthConfigurationSnapshot> {
    const state = await this.readState();
    return this.toAuthConfiguration(state);
  }

  async getUserSummary(userId: string): Promise<IdentityUserSummary | null> {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.id === userId);
    return user ? this.toUserSummary(user) : null;
  }

  async getUserSummaryByEmail(email: string): Promise<IdentityUserSummary | null> {
    const state = await this.readState();
    const user = state.users.find(
      (candidate) => candidate.email === normalizeEmail(email),
    );
    return user ? this.toUserSummary(user) : null;
  }

  async createInitialAdmin(input: RegisterPasswordInput) {
    const state = await this.readState();
    if (state.users.some((user) => user.roles.includes('system-admin'))) {
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

    state.users.push(user);
    await this.writeState(state);

    return this.toUserSummary(user);
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

    const adminTier = input.adminTier ?? this.extractAdminTier(input.roles ?? []);
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
      roles: adminTier == null ? roles : [...new Set([...roles, ...buildTierRoles(adminTier)])],
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
    await this.writeState(state);

    return {
      tokenDelivery,
      user: this.toUserSummary(user),
    };
  }

  async authenticatePassword(email: string, password: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.email === normalizeEmail(email));
    if (!user || !user.passwordHash || !verifyPasswordHash(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.assertAccountCanAuthenticate(user, state.config.requireEmailVerification);
    return this.toUserSummary(user);
  }

  async requestEmailVerification(email: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.email === normalizeEmail(email));
    if (!user || user.state !== 'active' || user.emailVerified) {
      return { expiresAt: null, previewToken: null };
    }

    const tokenDelivery = this.issueToken(
      state,
      user.id,
      'email-verification',
      emailVerificationTtlMs,
    );
    await this.writeState(state);
    return tokenDelivery;
  }

  async confirmEmailVerification(token: string) {
    const state = await this.readState();
    const user = this.consumeToken(state, token, 'email-verification');
    user.emailVerified = true;
    user.updatedAt = nowIso();
    await this.writeState(state);
    return this.toUserSummary(user);
  }

  async requestPasswordReset(email: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.email === normalizeEmail(email));
    if (!user || user.state !== 'active' || !user.passwordHash) {
      return { expiresAt: null, previewToken: null };
    }

    const tokenDelivery = this.issueToken(state, user.id, 'password-reset', passwordResetTtlMs);
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
    return this.toUserSummary(user);
  }

  async getConfiguredSocialProviders() {
    const state = await this.readState();
    return state.config.supportedSocialProviders.map(
      (provider) => socialProviderCatalog[provider],
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
      throw new ConflictException('That social identity is already linked to another account.');
    }

    if (
      owner.linkedSocialIdentities.some(
        (identity) => identity.provider === input.provider,
      )
    ) {
      throw new ConflictException('That provider is already linked to this account.');
    }

    owner.linkedSocialIdentities.push({
      linkedAt: nowIso(),
      provider: input.provider,
      providerSubject: input.providerSubject,
    });
    owner.updatedAt = nowIso();
    await this.writeState(state);
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
      throw new NotFoundException('That provider is not linked to the account.');
    }

    if (!this.hasUsableLoginMethod(user)) {
      throw new ConflictException(
        'You cannot remove the last usable authentication method from this account.',
      );
    }

    user.updatedAt = nowIso();
    await this.writeState(state);
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
    return this.toUserSummary(user);
  }

  async requestAccountRecovery(email: string) {
    const state = await this.readState();
    const user = state.users.find((candidate) => candidate.email === normalizeEmail(email));
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
    return this.toUserSummary(user);
  }

  async deactivateAccount(userId: string, actorRoles: string[]) {
    const state = await this.readState();
    const minimumTier = state.config.minAdminTierForAccountDeactivation;
    const actorTier = this.extractAdminTier(actorRoles);
    if (!actorRoles.includes('system-admin') || actorTier < minimumTier) {
      throw new UnauthorizedException('The current admin tier cannot deactivate accounts.');
    }

    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    user.state = 'deactivated';
    user.updatedAt = nowIso();
    await this.writeState(state);
    return this.toUserSummary(user);
  }

  async reactivateAccount(userId: string, actorRoles: string[]) {
    const state = await this.readState();
    const minimumTier = state.config.minAdminTierForAccountDeactivation;
    const actorTier = this.extractAdminTier(actorRoles);
    if (!actorRoles.includes('system-admin') || actorTier < minimumTier) {
      throw new UnauthorizedException('The current admin tier cannot reactivate accounts.');
    }

    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    user.state = 'active';
    user.updatedAt = nowIso();
    await this.writeState(state);
    return this.toUserSummary(user);
  }

  async updateAuthConfiguration(
    input: Partial<Pick<AuthConfigurationSnapshot, 'minAdminTierForAccountDeactivation' | 'requireEmailVerification'>>,
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

    this.assertAccountCanAuthenticate(user, state.config.requireEmailVerification);
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
      throw new BadRequestException('The provided token is invalid or expired.');
    }

    const user = state.users.find((candidate) => candidate.id === record.userId);
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
      throw new UnauthorizedException('Deleted accounts cannot perform this action.');
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
      throw new UnauthorizedException('Email verification is required before sign-in.');
    }
  }

  private hasUsableLoginMethod(user: PersistedUserRecord) {
    return Boolean(user.passwordHash) || user.linkedSocialIdentities.length > 0;
  }

  private extractAdminTier(roles: string[]) {
    const tierRole = roles.find((role) => role.startsWith('system-admin:tier:'));
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

  private toAuthConfiguration(state: PersistedIdentityState): AuthConfigurationSnapshot {
    return {
      minAdminTierForAccountDeactivation:
        state.config.minAdminTierForAccountDeactivation,
      requireEmailVerification: state.config.requireEmailVerification,
      supportedSocialProviders: state.config.supportedSocialProviders.map(
        (provider) => socialProviderCatalog[provider],
      ),
    };
  }

  private async readState(): Promise<PersistedIdentityState> {
    try {
      const content = await readFile(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(content) as PersistedIdentityState;
      const state = {
        config: {
          minAdminTierForAccountDeactivation:
            parsed.config?.minAdminTierForAccountDeactivation ?? 0,
          requireEmailVerification: parsed.config?.requireEmailVerification ?? false,
          supportedSocialProviders: this.normalizeProviderList(
            parsed.config?.supportedSocialProviders,
          ),
        },
        tokens: parsed.tokens ?? [],
        users: parsed.users ?? [],
      } satisfies PersistedIdentityState;
      this.pruneExpiredData(state);
      return state;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const state = this.createEmptyState();
        this.pruneExpiredData(state);
        return state;
      }

      throw error;
    }
  }

  private async writeState(state: PersistedIdentityState) {
    this.pruneExpiredData(state);
    await mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
  }

  private pruneExpiredData(state: PersistedIdentityState) {
    const currentTime = Date.now();
    state.tokens = state.tokens.filter(
      (token) =>
        !token.consumedAt &&
        new Date(token.expiresAt).getTime() > currentTime,
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
          process.env.AUTH_SOCIAL_PROVIDERS?.split(',') ?? ['google', 'github'],
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
          .filter((value): value is SocialProviderCode => value in socialProviderCatalog),
      ),
    );
  }
}
