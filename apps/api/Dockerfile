FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache ffmpeg

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/api
RUN npx prisma generate

FROM base AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apiuser
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/ ./
RUN mkdir -p tmp && chown -R apiuser:nodejs /app
USER apiuser
EXPOSE 4000
ENV PORT=4000
CMD ["npx", "tsx", "src/server.ts"]