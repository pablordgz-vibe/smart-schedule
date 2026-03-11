export const requestContextHeaderNames = {
  actorId: "x-actor-id",
  actorRoles: "x-actor-roles",
  activeContextId: "x-active-context-id",
  activeContextType: "x-active-context-type",
  correlationId: "x-correlation-id",
  requestId: "x-request-id",
  tenantId: "x-tenant-id",
  csrfToken: "x-csrf-token",
} as const;

export type ActorType = "anonymous" | "service" | "system" | "user";
export type ActiveContextType =
  | "organization"
  | "personal"
  | "public"
  | "system";

export type RequestActor = {
  id: string | null;
  roles: string[];
  type: ActorType;
};

export type ActiveContext = {
  id: string | null;
  tenantId: string | null;
  type: ActiveContextType;
};

export type RequestContext = {
  actor: RequestActor;
  context: ActiveContext;
  correlationId: string;
  requestId: string;
};

export type AuditEnvelope = {
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

export type AccountState = "active" | "deactivated";

export type SessionActor = {
  id: string;
  roles: string[];
  state: AccountState;
};

export type SessionContext = ActiveContext;

export type SessionRecord = {
  actor: SessionActor;
  context: SessionContext;
  createdAt: string;
  csrfToken: string;
  expiresAt: string;
  id: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

export type SecurityDenialKind =
  | "approval_required"
  | "authentication_required"
  | "context_mismatch"
  | "csrf_invalid"
  | "entitlement_limited"
  | "not_permitted"
  | "rate_limited"
  | "tenant_mismatch";

export type SecurityErrorPayload = {
  code: string;
  kind: SecurityDenialKind;
  message: string;
  details?: Record<string, string | string[] | null | undefined>;
};

export type RequestFieldBindingSource =
  | "actor.id"
  | "context.id"
  | "context.tenantId"
  | "context.type";

export type RequestFieldBinding = {
  equals: RequestFieldBindingSource;
  field: string;
  location: "body" | "params" | "query";
};

export type AuthorizationPolicy = {
  allowedActorTypes?: ActorType[];
  allowedContextTypes?: ActiveContextType[];
  bindings?: RequestFieldBinding[];
  requiredRoles?: string[];
  requireContextId?: boolean;
  requireTenant?: boolean;
};

export type RateLimitPolicy = {
  keyScope?: "actor-or-ip" | "ip";
  limit: number;
  windowMs: number;
};
