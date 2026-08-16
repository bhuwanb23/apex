#!/bin/sh
# Backend container entrypoint.
#  1. Push the Prisma schema to the SQLite file (idempotent).
#  2. Seed the DB on first boot only (sports → teams → NFL coaches → demo data).
#  3. Start the API.
#
# Seeding is guarded by a marker file on the data volume so restarts keep the
# existing demo data instead of re-seeding over it.

set -e

echo "[entrypoint] Pushing Prisma schema…"
npx prisma db push --skip-generate

if [ ! -f /app/data/.seeded ]; then
  echo "[entrypoint] First boot — seeding demo data…"
  npm run db:seed
  npm run db:seed:teams
  npm run db:seed:coaches
  npm run db:seed:demo
  # Mark seeded (idempotent restarts keep the data)
  mkdir -p /app/data
  touch /app/data/.seeded
  echo "[entrypoint] Seeding complete."
else
  echo "[entrypoint] DB already seeded — skipping."
fi

echo "[entrypoint] Starting API on :${PORT}"
exec node dist/index.js
