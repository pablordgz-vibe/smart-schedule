type RuntimeEnvironmentContract = {
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

declare const requestContextHeaderNames: {
    readonly actorId: "x-actor-id";
    readonly actorRoles: "x-actor-roles";
    readonly activeContextId: "x-active-context-id";
    readonly activeContextType: "x-active-context-type";
    readonly correlationId: "x-correlation-id";
    readonly requestId: "x-request-id";
    readonly tenantId: "x-tenant-id";
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

export { type ActiveContext, type ActiveContextType, type ActorType, type AuditEnvelope, type RequestActor, type RequestContext, type RuntimeEnvironmentContract, type RuntimeHealthResponse, type ServiceDiscoveryContract, requestContextHeaderNames, runtimeHealthRoutes, runtimeServices };
