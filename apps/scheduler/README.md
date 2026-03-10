# Scheduler Runtime

NestJS runtime for the Smart Schedule scheduler scaffold.

## Sprint 0 scope

- boot with the shared validated runtime environment
- expose `GET /health` and `GET /health/readiness`
- stay internal to the local Compose topology

## Local run

```bash
PORT=3002 pnpm --filter @smart-schedule/scheduler run start:dev
```

## Verification

```bash
pnpm --filter @smart-schedule/scheduler run test:e2e
curl http://localhost:3002/health
curl http://localhost:3002/health/readiness
```
