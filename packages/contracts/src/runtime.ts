export const runtimeServices = {
  api: {
    name: "api",
    displayName: "Smart Schedule API",
    defaultPort: 3000,
  },
  worker: {
    name: "worker",
    displayName: "Smart Schedule Worker",
    defaultPort: 3001,
  },
  scheduler: {
    name: "scheduler",
    displayName: "Smart Schedule Scheduler",
    defaultPort: 3002,
  },
  frontend: {
    name: "frontend",
    displayName: "Smart Schedule Frontend",
    defaultPort: 80,
  },
} as const;

export const runtimeHealthRoutes = {
  liveness: "/health",
  readiness: "/health/readiness",
} as const;

export type RuntimeHealthResponse = {
  status: "ok" | "error";
  info: {
    app: {
      status: "up" | "down";
    };
  };
};

export type ServiceDiscoveryContract = {
  frontendBaseUrl: string;
  apiBaseUrl: string;
  workerHealthUrl: string;
  schedulerHealthUrl: string;
  objectStorageConsoleUrl: string;
};
