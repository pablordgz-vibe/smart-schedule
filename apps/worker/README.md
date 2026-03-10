# Worker Runtime

NestJS runtime for the Smart Schedule background worker scaffold.

## Sprint 0 scope

- boot with the shared validated runtime environment
- expose `GET /health` and `GET /health/readiness`
- stay internal to the local Compose topology

## Local run

```bash
PORT=3001 pnpm --filter @smart-schedule/worker run start:dev
```

## Verification

```bash
pnpm --filter @smart-schedule/worker run test:e2e
curl http://localhost:3001/health
curl http://localhost:3001/health/readiness
```
