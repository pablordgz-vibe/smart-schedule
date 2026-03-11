// src/runtime.ts
var runtimeServices = {
  api: {
    name: "api",
    displayName: "Smart Schedule API",
    defaultPort: 3e3
  },
  worker: {
    name: "worker",
    displayName: "Smart Schedule Worker",
    defaultPort: 3001
  },
  scheduler: {
    name: "scheduler",
    displayName: "Smart Schedule Scheduler",
    defaultPort: 3002
  },
  frontend: {
    name: "frontend",
    displayName: "Smart Schedule Frontend",
    defaultPort: 80
  }
};
var runtimeHealthRoutes = {
  liveness: "/health",
  readiness: "/health/readiness"
};

// src/security.ts
var requestContextHeaderNames = {
  actorId: "x-actor-id",
  actorRoles: "x-actor-roles",
  activeContextId: "x-active-context-id",
  activeContextType: "x-active-context-type",
  correlationId: "x-correlation-id",
  requestId: "x-request-id",
  tenantId: "x-tenant-id",
  csrfToken: "x-csrf-token"
};
export {
  requestContextHeaderNames,
  runtimeHealthRoutes,
  runtimeServices
};
