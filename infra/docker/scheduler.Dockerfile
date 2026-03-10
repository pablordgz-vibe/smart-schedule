FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build --filter @smart-schedule/scheduler

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app /app

CMD ["node", "apps/scheduler/dist/src/main.js"]
