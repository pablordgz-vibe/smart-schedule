export const requestContextHeaderNames = {
  actorId: "x-actor-id",
  actorRoles: "x-actor-roles",
  activeContextId: "x-active-context-id",
  activeContextType: "x-active-context-type",
  correlationId: "x-correlation-id",
  requestId: "x-request-id",
  tenantId: "x-tenant-id",
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
