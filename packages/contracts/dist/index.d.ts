type RuntimeEnvironmentContract = {
    APP_EDITION: "commercial" | "community";
    NODE_ENV: "development" | "production" | "test";
    HOST: string;
    PORT: number;
    DATABASE_URL: string;
    REDIS_URL: string;
    OBJECT_STORAGE_ENDPOINT?: string;
    OBJECT_STORAGE_ACCESS_KEY?: string;
    OBJECT_STORAGE_SECRET_KEY?: string;
    OBJECT_STORAGE_BUCKET?: string;
    OBJECT_STORAGE_USE_SSL: boolean;
    JWT_SECRET: string;
    SESSION_SECRET: string;
    SESSION_COOKIE_NAME: string;
    SESSION_TTL_SECONDS: number;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX: number;
    AUTH_SOCIAL_PROVIDERS?: string;
    CALENDARIFIC_API_BASE_URL: string;
    CALENDARIFIC_PORTAL_BASE_URL: string;
};

declare const requestContextHeaderNames: {
    readonly actorId: "x-actor-id";
    readonly actorRoles: "x-actor-roles";
    readonly activeContextId: "x-active-context-id";
    readonly activeContextType: "x-active-context-type";
    readonly correlationId: "x-correlation-id";
    readonly requestId: "x-request-id";
    readonly tenantId: "x-tenant-id";
    readonly csrfToken: "x-csrf-token";
};
type ActorType = "anonymous" | "service" | "system" | "user";
type ActiveContextType = "organization" | "personal" | "public" | "system";
type RequestActor = {
    id: string | null;
    roles: string[];
    type: ActorType;
};
type ActiveContext = {
    id: string | null;
    tenantId: string | null;
    type: ActiveContextType;
};
type RequestContext = {
    actor: RequestActor;
    context: ActiveContext;
    correlationId: string;
    requestId: string;
};
type AuditEnvelope = {
    action: string;
    actorId: string | null;
    actorType: ActorType;
    contextId: string | null;
    contextType: ActiveContextType;
    correlationId: string;
    outcome: "failure" | "success";
    requestId: string;
    resource: string;
    tenantId: string | null;
};
type AccountState = "active" | "deactivated" | "deleted";
type SessionActor = {
    id: string;
    roles: string[];
    state: AccountState;
};
type SessionContext = ActiveContext;
type SessionRecord = {
    actor: SessionActor;
    context: SessionContext;
    createdAt: string;
    csrfToken: string;
    expiresAt: string;
    id: string;
    lastSeenAt: string;
    revokedAt: string | null;
};
type SecurityDenialKind = "bootstrap_locked" | "approval_required" | "authentication_required" | "context_mismatch" | "csrf_invalid" | "entitlement_limited" | "not_permitted" | "rate_limited" | "tenant_mismatch";
type SecurityErrorPayload = {
    code: string;
    kind: SecurityDenialKind;
    message: string;
    details?: Record<string, string | string[] | null | undefined>;
};
type RequestFieldBindingSource = "actor.id" | "context.id" | "context.tenantId" | "context.type";
type RequestFieldBinding = {
    equals: RequestFieldBindingSource;
    field: string;
    location: "body" | "params" | "query";
};
type AuthorizationPolicy = {
    allowedActorTypes?: ActorType[];
    allowedContextTypes?: ActiveContextType[];
    bindings?: RequestFieldBinding[];
    requiredRoles?: string[];
    requireContextId?: boolean;
    requireTenant?: boolean;
};
type RateLimitPolicy = {
    keyScope?: "actor-or-ip" | "ip";
    limit: number;
    windowMs: number;
};
type AppEdition = "commercial" | "community";
type SetupIntegrationCredentialMode = "api-key" | "provider-login";
type SetupIntegrationProvider = {
    category: "ai" | "calendar" | "email" | "holiday-data" | "identity";
    code: string;
    credentialModes: SetupIntegrationCredentialMode[];
    description: string;
    displayName: string;
};
type SetupIntegrationSelection = {
    code: string;
    credentials: Record<string, string>;
    enabled: boolean;
    mode: SetupIntegrationCredentialMode;
};
type SetupAdminRecord = {
    createdAt: string;
    email: string;
    id: string;
    name: string;
    role: "system-admin";
};
type SetupStateSnapshot = {
    admin: SetupAdminRecord | null;
    completedAt: string | null;
    configuredIntegrations: SetupIntegrationSelection[];
    edition: AppEdition;
    isComplete: boolean;
    step: "admin" | "complete" | "integrations" | "review";
};
type SetupBootstrapPayload = {
    admin: {
        email: string;
        name: string;
        password: string;
    };
    integrations: SetupIntegrationSelection[];
};

type SocialProviderCode = "github" | "google" | "microsoft";
type SocialProviderDescriptor = {
    code: SocialProviderCode;
    displayName: string;
};
type AuthMethodSummary = {
    kind: "password";
    linkedAt: string;
} | {
    kind: "social";
    linkedAt: string;
    provider: SocialProviderCode;
};
type IdentityUserSummary = {
    adminTier: number | null;
    authMethods: AuthMethodSummary[];
    email: string;
    emailVerified: boolean;
    id: string;
    name: string;
    recoverUntil: string | null;
    roles: string[];
    state: AccountState;
};
type SessionBootstrapContext = {
    key: string;
    label: string;
    membershipRole: "admin" | "member" | null;
    context: SessionContext;
};
type AuthSessionSnapshot = {
    activeContext: SessionContext;
    availableContexts: SessionBootstrapContext[];
    authenticated: boolean;
    configuredSocialProviders: SocialProviderDescriptor[];
    csrfToken: string | null;
    requireEmailVerification: boolean;
    user: IdentityUserSummary | null;
};
type AuthTokenDelivery = {
    expiresAt: string;
    previewToken: string | null;
};
type AuthMutationResult = {
    session: AuthSessionSnapshot;
    tokenDelivery?: AuthTokenDelivery;
};
type AuthConfigurationSnapshot = {
    minAdminTierForAccountDeactivation: number;
    requireEmailVerification: boolean;
    supportedSocialProviders: SocialProviderDescriptor[];
};

declare const runtimeServices: {
    readonly api: {
        readonly name: "api";
        readonly displayName: "Smart Schedule API";
        readonly defaultPort: 3000;
    };
    readonly worker: {
        readonly name: "worker";
        readonly displayName: "Smart Schedule Worker";
        readonly defaultPort: 3001;
    };
    readonly scheduler: {
        readonly name: "scheduler";
        readonly displayName: "Smart Schedule Scheduler";
        readonly defaultPort: 3002;
    };
    readonly frontend: {
        readonly name: "frontend";
        readonly displayName: "Smart Schedule Frontend";
        readonly defaultPort: 80;
    };
};
declare const runtimeHealthRoutes: {
    readonly liveness: "/health";
    readonly readiness: "/health/readiness";
};
type RuntimeHealthResponse = {
    status: "ok" | "error";
    info: {
        app: {
            status: "up" | "down";
        };
    };
};
type ServiceDiscoveryContract = {
    frontendBaseUrl: string;
    apiBaseUrl: string;
    workerHealthUrl: string;
    schedulerHealthUrl: string;
    objectStorageConsoleUrl: string;
};

export { type AccountState, type ActiveContext, type ActiveContextType, type ActorType, type AppEdition, type AuditEnvelope, type AuthConfigurationSnapshot, type AuthMethodSummary, type AuthMutationResult, type AuthSessionSnapshot, type AuthTokenDelivery, type AuthorizationPolicy, type IdentityUserSummary, type RateLimitPolicy, type RequestActor, type RequestContext, type RequestFieldBinding, type RequestFieldBindingSource, type RuntimeEnvironmentContract, type RuntimeHealthResponse, type SecurityDenialKind, type SecurityErrorPayload, type ServiceDiscoveryContract, type SessionActor, type SessionBootstrapContext, type SessionContext, type SessionRecord, type SetupAdminRecord, type SetupBootstrapPayload, type SetupIntegrationCredentialMode, type SetupIntegrationProvider, type SetupIntegrationSelection, type SetupStateSnapshot, type SocialProviderCode, type SocialProviderDescriptor, requestContextHeaderNames, runtimeHealthRoutes, runtimeServices };
