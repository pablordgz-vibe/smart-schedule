import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  SocialProviderCode,
  SocialProviderDescriptor,
} from '@smart-schedule/contracts';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ApiRequest } from '../security/request-context.types';
import { getHeaderValue } from '../security/http-platform';
import { DatabaseService } from '../persistence/database.service';
import { socialProviderCatalog } from './social-provider.catalog';

type OAuthFlowMode = 'link' | 'sign-in';

type OAuthStatePayload = {
  actorId: string | null;
  expiresAt: number;
  intent: OAuthFlowMode;
  nonce: string;
  provider: SocialProviderCode;
  returnTo: string;
  sessionId: string | null;
};

type OAuthIdentity = {
  email: string;
  name: string;
  provider: SocialProviderCode;
  providerSubject: string;
};

type OAuthProviderDefinition = {
  authorizeUrl: string;
  integrationCode: string;
  getScopes(): string[];
  resolveProfile(input: {
    accessToken: string;
  }): Promise<{ email: string; name: string; subject: string }>;
  resolveTokenUrl(): string;
};

type ConfiguredOAuthProviderDefinition = OAuthProviderDefinition & {
  credentials: Record<string, unknown>;
};

const oauthStateTtlMs = 10 * 60 * 1000;

function normalizeText(value: string) {
  return value.trim();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

@Injectable()
export class OAuthService {
  private readonly sessionSecret =
    process.env.SESSION_SECRET ?? 'development-session-secret-must-change-0001';

  constructor(private readonly databaseService: DatabaseService) {}

  private readonly providers: Record<
    SocialProviderCode,
    OAuthProviderDefinition
  > = {
    google: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      integrationCode: 'google-social-auth',
      getScopes: () => ['openid', 'email', 'profile'],
      resolveProfile: ({ accessToken }) =>
        this.fetchGoogleProfile({ accessToken }),
      resolveTokenUrl: () => 'https://oauth2.googleapis.com/token',
    },
    github: {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      integrationCode: 'github-social-auth',
      getScopes: () => ['read:user', 'user:email'],
      resolveProfile: ({ accessToken }) =>
        this.fetchGitHubProfile({ accessToken }),
      resolveTokenUrl: () => 'https://github.com/login/oauth/access_token',
    },
    microsoft: {
      authorizeUrl:
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      integrationCode: 'microsoft-social-auth',
      getScopes: () => ['openid', 'email', 'profile', 'User.Read'],
      resolveProfile: ({ accessToken }) =>
        this.fetchMicrosoftProfile({ accessToken }),
      resolveTokenUrl: () =>
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    },
  };

  async getConfiguredProviders() {
    const supported = await this.loadConfiguredProviderCodes();
    return supported.map((provider) => socialProviderCatalog[provider]);
  }

  async getAvailableProviders(
    supportedProviders: SocialProviderCode[],
  ): Promise<SocialProviderDescriptor[]> {
    const configuredProviders = new Set(
      await this.loadConfiguredProviderCodes(),
    );
    return supportedProviders
      .filter((provider) => configuredProviders.has(provider))
      .map((provider) => socialProviderCatalog[provider]);
  }

  async createAuthorizationUrl(input: {
    intent: OAuthFlowMode;
    provider: SocialProviderCode;
    request: ApiRequest;
    returnTo: string;
  }) {
    const provider = await this.getProviderDefinition(input.provider);
    const clientId = this.getRequiredCredential(
      provider.credentials,
      'clientId',
      input.provider,
    );
    const callbackUrl = this.buildCallbackUrl(input.request, input.provider);
    const state = this.signState({
      actorId:
        input.intent === 'link'
          ? (input.request.requestContext?.actor.id ?? null)
          : null,
      expiresAt: Date.now() + oauthStateTtlMs,
      intent: input.intent,
      nonce: randomUUID(),
      provider: input.provider,
      returnTo: this.normalizeReturnTo(input.request, input.returnTo),
      sessionId:
        input.intent === 'link' ? (input.request.session?.id ?? null) : null,
    });

    const url = new URL(provider.authorizeUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.getScopes().join(' '));
    url.searchParams.set('state', state);

    if (input.provider === 'google' || input.provider === 'microsoft') {
      url.searchParams.set('prompt', 'select_account');
    }

    return url.toString();
  }

  verifyState(stateToken: string | undefined, provider: SocialProviderCode) {
    if (!stateToken) {
      throw new BadRequestException('Missing OAuth state.');
    }

    const [encodedPayload, signature] = stateToken.split('.');
    if (!encodedPayload || !signature) {
      throw new BadRequestException('Invalid OAuth state.');
    }

    const expectedSignature = createHmac('sha256', this.sessionSecret)
      .update(encodedPayload)
      .digest('base64url');
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new BadRequestException('Invalid OAuth state signature.');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as OAuthStatePayload;
    if (payload.provider !== provider) {
      throw new BadRequestException('OAuth state/provider mismatch.');
    }
    if (payload.expiresAt <= Date.now()) {
      throw new BadRequestException('OAuth state has expired.');
    }

    return payload;
  }

  async exchangeCodeForProfile(input: {
    code: string;
    provider: SocialProviderCode;
    request: ApiRequest;
  }): Promise<OAuthIdentity> {
    const provider = await this.getProviderDefinition(input.provider);
    const accessToken = await this.exchangeCodeForAccessToken({
      callbackUrl: this.buildCallbackUrl(input.request, input.provider),
      clientId: this.getRequiredCredential(
        provider.credentials,
        'clientId',
        input.provider,
      ),
      clientSecret: this.getRequiredCredential(
        provider.credentials,
        'clientSecret',
        input.provider,
      ),
      code: input.code,
      tokenUrl: provider.resolveTokenUrl(),
    });
    const profile = await provider.resolveProfile({ accessToken });

    return {
      email: normalizeEmail(profile.email),
      name: normalizeText(profile.name || profile.email),
      provider: input.provider,
      providerSubject: `${input.provider}:${profile.subject}`,
    };
  }

  buildFrontendRedirect(
    request: Pick<ApiRequest, 'headers' | 'protocol'>,
    returnTo: string,
    params: Record<string, string>,
  ) {
    const url = new URL(
      this.normalizeReturnTo(request, returnTo),
      `${this.resolveReturnBaseUrl(request).replace(/\/$/, '')}/`,
    );
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private normalizeReturnTo(
    request: Pick<ApiRequest, 'headers' | 'protocol'>,
    returnTo: string,
  ) {
    const candidate = returnTo.trim() || '/home';
    if (candidate.startsWith('/')) {
      return candidate;
    }

    const resolved = new URL(candidate);
    const allowedOrigins = new Set<string>([
      this.resolveReturnBaseUrl(request),
      this.resolveApiBaseUrl(request),
    ]);
    if (!allowedOrigins.has(resolved.origin)) {
      throw new BadRequestException(
        'Return targets must stay within the current application origin.',
      );
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }

  private async getProviderDefinition(
    provider: SocialProviderCode,
  ): Promise<ConfiguredOAuthProviderDefinition> {
    const definition = this.providers[provider];
    if (!definition) {
      throw new BadRequestException(
        `Unsupported social provider: ${provider}.`,
      );
    }

    const integration = await this.readProviderIntegration(
      definition.integrationCode,
    );
    if (!integration?.enabled) {
      throw new BadRequestException(
        `${socialProviderCatalog[provider].displayName} sign-in is not configured.`,
      );
    }

    const configured: ConfiguredOAuthProviderDefinition = {
      ...definition,
      credentials: integration.credentials ?? {},
    };

    if (provider === 'microsoft') {
      const tenantId =
        this.readOptionalCredential(configured.credentials, 'tenantId') ||
        'common';
      configured.authorizeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
      configured.resolveTokenUrl = () =>
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    }

    return configured;
  }

  private buildCallbackUrl(
    request: Pick<ApiRequest, 'headers' | 'protocol'>,
    provider: SocialProviderCode,
  ) {
    return `${this.resolveApiBaseUrl(request)}/auth/oauth/${provider}/callback`;
  }

  private resolveApiBaseUrl(request: Pick<ApiRequest, 'headers' | 'protocol'>) {
    const forwardedProto = getHeaderValue(request, 'x-forwarded-proto');
    const host =
      getHeaderValue(request, 'x-forwarded-host') ??
      getHeaderValue(request, 'host');
    if (!host) {
      throw new BadRequestException('Unable to resolve the application host.');
    }

    return `${forwardedProto ?? request.protocol ?? 'http'}://${host}`;
  }

  private resolveReturnBaseUrl(
    request: Pick<ApiRequest, 'headers' | 'protocol'>,
  ) {
    const originHeader = getHeaderValue(request, 'origin');
    if (originHeader) {
      return originHeader;
    }

    const referer = getHeaderValue(request, 'referer');
    if (referer) {
      return new URL(referer).origin;
    }

    return this.resolveApiBaseUrl(request);
  }

  private signState(payload: OAuthStatePayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.sessionSecret)
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private getRequiredCredential(
    credentials: Record<string, unknown>,
    key: string,
    provider: SocialProviderCode,
  ) {
    const value = credentials[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(
        `${socialProviderCatalog[provider].displayName} sign-in is not configured.`,
      );
    }

    return value;
  }

  private readOptionalCredential(
    credentials: Record<string, unknown>,
    key: string,
  ) {
    const value = credentials[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : '';
  }

  private async loadConfiguredProviderCodes() {
    const result = await this.databaseService.query<{ code: string }>(
      `select code
       from setup_integrations
       where enabled = true
         and code = any($1::text[])
         and coalesce(credentials ->> 'clientId', '') <> ''
         and coalesce(credentials ->> 'clientSecret', '') <> ''`,
      [
        Object.values(this.providers).map(
          (provider) => provider.integrationCode,
        ),
      ],
    );

    const configuredCodes = new Set(result.rows.map((row) => row.code));
    return (
      Object.entries(this.providers) as Array<
        [SocialProviderCode, OAuthProviderDefinition]
      >
    )
      .filter(([, provider]) => configuredCodes.has(provider.integrationCode))
      .map(([providerCode]) => providerCode);
  }

  private async readProviderIntegration(integrationCode: string) {
    const result = await this.databaseService.query<{
      credentials: Record<string, unknown>;
      enabled: boolean;
    }>(
      `select credentials, enabled
       from setup_integrations
       where code = $1`,
      [integrationCode],
    );

    return result.rows[0] ?? null;
  }

  private async exchangeCodeForAccessToken(input: {
    callbackUrl: string;
    clientId: string;
    clientSecret: string;
    code: string;
    tokenUrl: string;
  }) {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.callbackUrl,
    });
    const response = await fetch(input.tokenUrl, {
      body,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new BadRequestException(
        payload.error_description ??
          payload.error ??
          'Token exchange failed for the selected social provider.',
      );
    }

    return payload.access_token;
  }

  private async fetchGoogleProfile(input: { accessToken: string }) {
    const response = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      sub?: string;
    };

    if (!response.ok || !payload.email || !payload.sub) {
      throw new BadRequestException('Google did not return a usable profile.');
    }

    return {
      email: payload.email,
      name: payload.name ?? payload.email,
      subject: payload.sub,
    };
  }

  private async fetchGitHubProfile(input: { accessToken: string }) {
    const headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${input.accessToken}`,
      'user-agent': 'SmartSchedule/1.0',
      'x-github-api-version': '2022-11-28',
    };
    const [userResponse, emailResponse] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ]);
    const userPayload = (await userResponse.json().catch(() => ({}))) as {
      email?: string | null;
      id?: number | string;
      login?: string;
      name?: string | null;
    };
    const emailPayload = (await emailResponse.json().catch(() => [])) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;

    const primaryEmail =
      emailPayload.find((entry) => entry.primary && entry.verified)?.email ??
      emailPayload.find((entry) => entry.verified)?.email ??
      userPayload.email ??
      null;

    if (
      !userResponse.ok ||
      !emailResponse.ok ||
      !primaryEmail ||
      !userPayload.id
    ) {
      throw new BadRequestException('GitHub did not return a usable profile.');
    }

    return {
      email: primaryEmail,
      name:
        normalizeText(userPayload.name ?? '') ||
        normalizeText(userPayload.login ?? '') ||
        primaryEmail,
      subject: String(userPayload.id),
    };
  }

  private async fetchMicrosoftProfile(input: { accessToken: string }) {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
      {
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      displayName?: string;
      id?: string;
      mail?: string | null;
      userPrincipalName?: string | null;
    };

    const email = payload.mail ?? payload.userPrincipalName ?? null;
    if (!response.ok || !payload.id || !email) {
      throw new BadRequestException(
        'Microsoft did not return a usable profile.',
      );
    }

    return {
      email,
      name: payload.displayName ?? email,
      subject: payload.id,
    };
  }
}
