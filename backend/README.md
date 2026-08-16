# AQX Sports Intelligence — Backend

Node.js + Express backend for [AQX Sports Intelligence](../README.md), plus the Python ML microservice. Serves the React Native app (injury risk, coaching decisions, momentum), caches everything, and syncs real sports data on a schedule.

## Tech stack

| Concern      | Choice                                        |
| ------------ | --------------------------------------------- |
| Runtime      | Node.js (>= 20)                               |
| Framework    | Express 5                                     |
| Language     | TypeScript (strict, ESM)                      |
| Database     | SQLite via **better-sqlite3**                 |
| ORM          | **Prisma** (driver adapter: better-sqlite3)   |
| ML / AI      | Python FastAPI microservice (separate process, HTTP) |
| Jobs         | node-cron (data sync every 6h, risk compute, momentum, cleanup) |
| Caching      | **node-cache** (in-memory) + SQLite registry (survives restarts) |
| API docs     | **Swagger UI** (auto-generated from JSDoc)    |

## Getting started

```bash
cd backend
npm install            # also runs `prisma generate` (postinstall)
cp .env.example .env   # defaults work for local dev
npm run db:push        # creates prisma/aqx.db
npm run db:seed:demo   # optional — pre-loads the demo dataset
npm run dev            # dev server with hot reload
```

The Python ML service runs separately (port 8001):

```bash
cd backend/python_ml
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows (POSIX: .venv/bin/pip)
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

**Verify everything is up:**

- API: http://localhost:8000
- Health: http://localhost:8000/api/health → `{ status: "ok", services: { database, cache, mlService: "connected" } }`
- Swagger docs: http://localhost:8000/api/docs (alias of `/api-docs`)
- Raw OpenAPI spec: http://localhost:8000/api-docs.json

## Scripts

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server (tsx watch)                   |
| `npm run build`     | Compile TS → `dist/`                     |
| `npm start`         | Run compiled server                      |
| `npm run typecheck` | Type-check without emitting              |
| `npm run lint`      | ESLint on `src`                          |
| `npm run lint:fix`  | ESLint with auto-fix                     |
| `npm run format`    | Prettier on `src`                        |
| `npm run db:generate` | Regenerate Prisma client              |
| `npm run db:push`   | Push schema to SQLite (dev workflow)     |
| `npm run db:migrate`| Create & apply migrations                |
| `npm run db:seed`   | Base seed (`prisma/seed.ts`)             |
| `npm run db:seed:coaches` | Seed NFL coaches + decisions      |
| `npm run db:seed:demo` | **Demo dataset** (rosters, logs, risk scores, momentum verdicts, timelines) |
| `node scripts/refresh-scorecards.ts [sport]` | Re-evaluate decisions via ML + rebuild leaderboard |
| `node scripts/validate-demo-data.mjs` | 36 API checks across every demo screen |

## Project layout

```
backend/
├── prisma/
│   ├── schema/               # multi-file schema — one .prisma file per table
│   │   └── schema.prisma     #   generator + datasource blocks
│   ├── seed.ts               # base seed
│   └── aqx.db                # SQLite database
├── src/
│   ├── index.ts             # entry point — boot, graceful shutdown
│   ├── app.ts               # Express app factory (helmet, CORS, compression,
│   │                        #   logger, rate limit, cache middleware, routes, error)
│   ├── config/              # env validation (zod), logger (pino + file logs)
│   ├── controllers/         # route handlers (thin)
│   ├── services/            # business logic (injury, decisions, momentum, search, story…)
│   ├── data/                # sports API fetchers (nba, nfl, mlb) + sync coordinator
│   ├── ml/                  # Python microservice HTTP clients
│   ├── jobs/                # node-cron background jobs (sync, risk, momentum, cleanup, health)
│   ├── db/                  # Prisma client (better-sqlite3 adapter)
│   ├── cache/               # node-cache + SQLite cache service + invalidation
│   ├── middleware/          # cors, logger, cache, admin, validation, error
│   ├── routes/              # Express routers (JSDoc → Swagger)
│   ├── swagger/             # swagger-jsdoc spec
│   ├── types/               # shared TypeScript types
│   ├── utils/               # response, validator, logger, cache config/keys
│   └── generated/prisma/    # Prisma client (gitignored, regenerated)
├── python_ml/               # Python ML microservice (FastAPI)
│   └── app/
│       ├── main.py          # FastAPI app — /health, /injury, /decisions, /momentum, /story
│       └── models/          # injury_model.py (z-scores), decision_model.py (EV),
│                            #   momentum_model.py (Cox/lifelines), timeout_model.py
├── logs/                    # pino log files (error.log, combined.log)
├── scripts/                 # seed, refresh, validation, per-phase test scripts
└── .env                     # local env (copy of .env.example)
```

## Notes

- **Schema changes:** after editing a file in `prisma/schema/` run `npm run db:push` (dev) or `npm run db:migrate` (when stable).
- **Responses:** every route uses `src/utils/response.util.ts` — `{ success, status, data, message, timestamp }` for success, `{ success, status, message, error, timestamp }` for errors.
- **Health check:** `GET /api/health` pings the database, cache and the Python ML service (`PYTHON_ML_URL`); returns 503 with `status: degraded` if the database is unreachable. Health responses are never cached or rate-limited.
- **Rate limiting:** applied to all `/api` routes (15 min window, configurable — see `.env`). Health and docs are exempt.
- **Caching:** in-memory + SQLite registry with stale-while-revalidate. Every cached response carries `X-Cache-Status` (`HIT` / `MISS` / `STALE`).
- **Demo data:** `npm run db:seed:demo` pre-loads a realistic snapshot (real team/player names, synthetic logs, pre-computed scores and verdicts) so the demo never depends on API rate limits. After re-seeding, restart the backend (memory cache holds stale ids).
- **ML service:** the Node backend never computes statistics itself — it calls Python over HTTP and falls back to the last stored scores when Python is unreachable.

See the [root README](../README.md) for the full product overview, architecture diagrams and testing guide.
