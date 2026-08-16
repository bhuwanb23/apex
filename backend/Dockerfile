# Apex backend — Node.js (Express + Prisma + SQLite)
FROM node:20-slim AS build

WORKDIR /app

# better-sqlite3 + prisma engines need build tooling and OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY prisma.config.ts ./
COPY prisma ./prisma
# prisma.config.ts resolves DATABASE_URL via env() even for generate/validate
ENV DATABASE_URL="file:/app/data/aqx.db"
RUN npm ci

COPY src ./src
COPY tsconfig.json eslint.config.js ./

RUN npm run db:generate && npm run build

# --- runtime stage ---
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8000
ENV DATABASE_URL="file:/app/data/aqx.db"
ENV PYTHON_ML_URL="http://ml:8001"
ENV ALLOWED_ORIGINS="http://localhost:8081,http://localhost:3000"

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts
# Seed scripts run via tsx and import from ../src — keep the TS sources
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json

EXPOSE 8000

# Entrypoint: push schema, seed once, then serve. See scripts/docker-entrypoint.sh
CMD ["sh", "scripts/docker-entrypoint.sh"]
