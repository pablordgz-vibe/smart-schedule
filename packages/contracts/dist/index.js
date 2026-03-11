"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  requestContextHeaderNames: () => requestContextHeaderNames,
  runtimeHealthRoutes: () => runtimeHealthRoutes,
  runtimeServices: () => runtimeServices
});
module.exports = __toCommonJS(index_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  requestContextHeaderNames,
  runtimeHealthRoutes,
  runtimeServices
});
