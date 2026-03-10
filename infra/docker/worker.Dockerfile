FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build --filter @smart-schedule/worker

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/apps/worker/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/worker/package.json /app/package.json

CMD ["node", "dist/main"]
