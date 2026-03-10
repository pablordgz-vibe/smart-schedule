# Frontend Runtime

Angular web/PWA shell for the Smart Schedule UI scaffold.

## Sprint 0 scope

- bootable shell and setup route
- static build served by the frontend runtime
- local access through the reverse proxy in `infra/compose/local.yml`

## Local run

```bash
pnpm --filter @smart-schedule/frontend run start
```

## Verification

```bash
pnpm --filter @smart-schedule/frontend run build
pnpm --filter @smart-schedule/frontend run test:e2e
```
