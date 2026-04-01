# =============================================================================
# NITBox API — Multi-stage Dockerfile
# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .
# =============================================================================

# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
# Copy workspace manifests only (for better layer caching)
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/ packages/

RUN npm ci

# ---- Build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Compile NestJS
RUN npm run build --workspace=@nitbox/api

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output + Prisma runtime
COPY --from=builder /app/apps/api/dist            ./dist
COPY --from=builder /app/apps/api/prisma          ./prisma
COPY --from=builder /app/node_modules             ./node_modules
COPY --from=builder /app/apps/api/node_modules    ./apps/api/node_modules

EXPOSE 3001

CMD ["node", "dist/main"]
