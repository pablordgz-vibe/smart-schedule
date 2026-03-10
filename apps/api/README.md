# API Runtime

NestJS runtime for the Smart Schedule HTTP API scaffold.

## Sprint 0 scope

- boot with validated environment variables from `@smart-schedule/config`
- expose `GET /health` and `GET /health/readiness`
- install the API security-kernel scaffold: correlation IDs, request context, public-route metadata, validation, and audit logging hooks
- run inside the local Compose stack behind the reverse proxy

Health endpoints are explicitly public. Future authenticated routes inherit the global guard and must provide the identity/context scaffold headers defined in `@smart-schedule/contracts`.

## Local run

```bash
pnpm --filter @smart-schedule/api run start:dev
```

Required environment variables are defined in [`.env.example`](/home/pablo/vibe-coding/smart-schedule/.env.example).

## Verification

```bash
pnpm --filter @smart-schedule/api run test:e2e
curl http://localhost:3000/health
curl http://localhost:3000/health/readiness
```
