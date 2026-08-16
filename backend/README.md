# Apex Sports Intelligence — Backend

Node.js backend for Apex Sports Intelligence.

## Tech Stack

| Concern      | Choice                                        |
| ------------ | --------------------------------------------- |
| Runtime      | Node.js (>= 20)                               |
| Framework    | Express 5                                     |
| Language     | TypeScript (strict, ESM)                      |
| Database     | SQLite via **better-sqlite3**                 |
| ORM          | **Prisma** (driver adapter: better-sqlite3)   |
| ML / AI      | Python microservice (separate, HTTP) — later  |
| Job queue    | BullMQ (planned, deferred until data phase)   |
| Caching      | **node-cache** (in-memory) + SQLite           |
| API docs     | **Swagger UI** (auto-generated via swagger-jsdoc) |

## Getting started

```bash
cd backend
npm install        # also runs `prisma generate` (postinstall)
npm run db:push    # creates prisma/aqx.db
npm run dev        # starts dev server with hot reload
```

- API: http://localhost:8000
- Health: http://localhost:8000/api/health
- Swagger docs: http://localhost:8000/api-docs
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

## Project layout

```
backend/
├── prisma/
│   ├── schema/               # multi-file schema — one .prisma file per table
│   │   ├── schema.prisma     #   generator + datasource blocks
│   │   ├── sports.prisma     #   Sports
│   │   ├── teams.prisma      #   Teams
│   │   ├── players.prisma    #   Players
│   │   ├── coaches.prisma    #   Coaches
│   │   ├── games.prisma      #   Games
│   │   └── ...               #   one file per remaining table
│   └── aqx.db                # SQLite database
├── src/
│   ├── index.ts             # Entry point — boot, graceful shutdown
│   ├── app.ts               # Express app factory (helmet, CORS, compression,
│   │                        #   logger, rate limit, cache, routes, error)
│   ├── config/              # env validation (zod), logger (pino + file logs)
│   ├── controllers/         # route handler logic (health.controller.ts)
│   ├── services/            # business logic layer (future phases)
│   ├── data/                # sports API fetchers (future phases)
│   ├── ml/                  # Python microservice callers (future phases)
│   ├── jobs/                # background jobs (future phases)
│   ├── db/                  # Prisma client (better-sqlite3 adapter)
│   ├── cache/               # node-cache singleton + typed helpers
│   ├── middleware/          # cors, logger, cache, error middleware
│   ├── routes/              # Express routers (JSDoc → Swagger)
│   ├── swagger/             # swagger-jsdoc spec
│   ├── types/               # shared TypeScript types (future phases)
│   ├── utils/               # response.util, validator.util, logger.util
│   └── generated/prisma/    # Prisma client (gitignored, regenerated)
├── python_ml/               # Python ML microservice (future phase)
├── logs/                    # pino log files (error.log, combined.log)
├── cache/                   # cache workspace
└── .env                     # local env (copy of .env.example)
```

## Notes

- **Schema changes:** after editing a file in `prisma/schema/` run
  `npm run db:push` (dev) or `npm run db:migrate` (when the schema is stable).
- **Responses:** every route uses the standard shapes from
  `src/utils/response.util.ts` (`{ success, status, data, message, timestamp }`
  for success, `{ success, status, message, error, timestamp }` for errors).
- **Health check:** `GET /api/health` pings the database, cache and the Python
  ML service (`PYTHON_ML_URL`); returns 503 with `status: degraded` if the
  database is unreachable. Health responses are never cached.
- **Rate limiting:** applied to all `/api` routes (15 min window, 100 requests
  by default — see `.env`).
- **Queue:** BullMQ + Redis are intentionally deferred; they arrive with the
  background data-processing phase.
- **Python microservice:** will be called over HTTP for statistical models
  (Z-score injuries, Cox hazard, EV/win-probability, story generation).
