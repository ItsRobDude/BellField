# BellField delivery relay — BellField-hosted service, never part of the
# customer release artifact (D7). Build from the repo root:
#   docker build -f apps/relay/Dockerfile -t bellfield-relay .

FROM node:24-alpine AS build
WORKDIR /workspace

# Install with just the manifests first so dependency layers cache.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
RUN corepack enable
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/relay/package.json apps/relay/package.json
# --ignore-scripts: the repo root prepare hook wants a git checkout.
# contracts is selected directly (not just via the relay's `...` closure) so
# its devDependencies (tsc) install too.
RUN pnpm install --frozen-lockfile --ignore-scripts \
  --filter "@bellfield/relay..." --filter "@bellfield/contracts"

COPY packages/contracts packages/contracts
COPY apps/relay apps/relay
RUN pnpm --filter @bellfield/contracts build && pnpm --filter @bellfield/relay build
# Produce a self-contained production package (workspace deps materialized).
RUN pnpm --filter @bellfield/relay deploy --prod --legacy /deploy

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app
USER node
EXPOSE 3201
CMD ["node", "dist/apps/relay/src/main.js"]
