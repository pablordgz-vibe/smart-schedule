# Hosted Deployment Skeleton

Sprint 0 includes a hosted deployment scaffold so the repo has an explicit landing zone for non-Compose environments.

## Included

- Kubernetes namespace and config map
- one deployment and service skeleton per runtime
- a shared ingress skeleton

## Assumptions

- PostgreSQL, Redis, and object storage are managed services in the hosted environment
- secrets are injected by the platform, not committed to git
- this folder is intentionally a skeleton and not a production-ready manifest set
