# syntax=docker/dockerfile:1.7

# Keep in step with .nvmrc (CI reads that file for setup-node, and passes it
# here as --build-arg NODE_VERSION=$(cat .nvmrc), so a drift between the two
# shows up as a failing Docker Image job rather than as a surprise in prod).
# Node 20 went EOL in April 2026 and is excluded by the `engines` field.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev is essential — some daemons set NODE_ENV=production which would otherwise omit devDeps (next, prisma CLI, tsx).
RUN npm ci --include=dev
COPY . .
RUN node prisma/build-schema.mjs && ./node_modules/.bin/prisma generate

FROM base AS migrate
# migrate service runs migrations + seed against the live db.
CMD ["sh", "-c", "node prisma/build-schema.mjs && npx prisma migrate deploy && npm run prisma:seed"]

FROM base AS worker
# Runs the long-lived queue consumer. Uses tsx (resolves @/* aliases) against
# full source from the base stage, which already has devDeps + generated client.
CMD ["sh", "-c", "node prisma/build-schema.mjs && npx tsx src/worker/index.ts"]

FROM base AS builder
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/messages ./messages
EXPOSE 3000
CMD ["node", "server.js"]
