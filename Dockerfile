# node 24-alpine (digest atualizado pelo Dependabot)
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
ENV CI=true npm_config_store_dir=/root/.local/share/pnpm/store
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --ignore-scripts: sem .git o `prepare` (husky) não tem o que fazer.
FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

FROM base AS deps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
ENV NODE_ENV=production TZ=America/Sao_Paulo
WORKDIR /app
# Arquivos ficam de root: o usuário node só lê.
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Remove package managers the app never runs (smaller trivy surface); CMD uses only node and sh.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1
# Migrations antes do app; exec para o Node receber o SIGTERM do redeploy.
CMD ["sh", "-c", "node dist/database/migrar.js && exec node dist/main.js"]
