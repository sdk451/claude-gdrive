# syntax=docker/dockerfile:1
# Production image: Node 22 on Debian bookworm-slim, non-root, ESM entry at dist/index.js
# See docs/environments.md (Artifact Registry repo `gdrive-mcp`).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

FROM deps AS prod-deps
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs appuser
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=appuser:nodejs /app/dist ./dist
COPY --chown=appuser:nodejs package.json ./
USER appuser
EXPOSE 8080
CMD ["node", "dist/index.js"]
