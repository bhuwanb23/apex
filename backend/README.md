# AQX Sports Intelligence — Backend

Node.js backend for AQX Sports Intelligence.

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
npm run db:push    # creates prisma/dev.db
npm run dev        # starts dev server with hot reload
```

- API: http://localhost:4000
- Health: http://localhost:4000/health
- Swagger docs: http://localhost:4000/api-docs

## Scripts

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server (tsx watch)                   |
| `npm run build`     | Compile TS → `dist/`                     |
| `npm start`         | Run compiled server                      |
| `npm run typecheck` | Type-check without emitting              |
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
│   │   └── games.prisma      #   Games
│   └── dev.db                # SQLite database
├── src/
│   ├── index.ts             # Entry point — boot, graceful shutdown
│   ├── app.ts               # Express app factory
│   ├── config/              # env validation (zod), logger (pino)
│   ├── db/                  # Prisma client (better-sqlite3 adapter)
│   ├── cache/               # node-cache singleton + typed helpers
│   ├── middleware/          # ApiError, 404, error handler
│   ├── routes/              # Express routers (JSDoc → Swagger)
│   ├── swagger/             # swagger-jsdoc spec
│   └── generated/prisma/    # Prisma client (gitignored, regenerated)
└── .env                     # local env (copy of .env.example)
```

## Notes

- **Schema changes:** after editing `prisma/schema.prisma` run `npm run db:push`
  (dev) or `npm run db:migrate` (when the schema is stable).
- **Queue:** BullMQ + Redis are intentionally deferred; they arrive with the
  background data-processing phase.
- **Python microservice:** will be called over HTTP for statistical models
  (Z-score injuries, Cox hazard, EV/win-probability, story generation).
