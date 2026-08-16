# Apex Sports Intelligence — Backend Development Phases

---

## Tech Stack Correction — Node.js Backend

```
Backend Runtime     → Node.js
Framework           → Express.js
Language            → JavaScript / TypeScript
Database            → SQLite (via better-sqlite3)
ORM                 → Prisma (clean schema management)
ML / AI             → Python microservice (separate, called by Node)
Job Queue           → Bull (background data processing)
Caching             → Node-cache (in memory) + SQLite
API Docs            → Swagger UI (auto generated)
```

### Why This Split
```
Node.js handles
├── All API routes
├── Data fetching from sports APIs
├── Database operations
├── Caching logic
├── Request/response handling
└── Serving frontend

Python Microservice handles
├── Z-score injury calculations
├── Cox hazard momentum model
├── EV and win probability models
├── Story mode text generation
└── All heavy statistical work

Node calls Python microservice via HTTP
Clean separation, both run independently
```

---

## Database Schema — SQLite via Prisma

### All Tables Planned

```
Tables
│
├── sports                  → NBA, NFL, MLB, NHL configs
├── teams                   → All teams per sport
├── players                 → All players with team reference
├── player_game_logs        → Game by game workload data
├── injury_risk_scores      → Computed risk scores stored
├── games                   → Game records per sport
├── play_by_play            → Every play in every game
├── coach_decisions         → Extracted decisions per coach
├── decision_ev_scores      → EV calculations stored
├── momentum_analysis       → Pre-computed momentum results
├── momentum_game_data      → Per game momentum timeline
├── cache_metadata          → Track what data is cached and when
└── story_logs              → Generated story mode text cached
```

---

## Full Phase Breakdown

---

# PHASE 1 — Project Foundation

### What This Phase Does
Sets up the entire Node.js project skeleton
Every other phase builds on top of this

### Tasks

**1.1 — Project Initialization**
```
Initialize Node.js project
Setup TypeScript configuration
Setup ESLint and Prettier
Setup folder structure
Setup environment variable handling with dotenv
Setup nodemon for development auto-restart
```

**1.2 — Folder Structure**
```
backend/
│
├── src/
│   ├── routes/             # All Express route files
│   │   ├── injury.routes.ts
│   │   ├── decisions.routes.ts
│   │   ├── momentum.routes.ts
│   │   └── shared.routes.ts
│   │
│   ├── controllers/        # Route handler logic
│   │   ├── injury.controller.ts
│   │   ├── decisions.controller.ts
│   │   ├── momentum.controller.ts
│   │   └── shared.controller.ts
│   │
│   ├── services/           # Business logic layer
│   │   ├── injury.service.ts
│   │   ├── decisions.service.ts
│   │   ├── momentum.service.ts
│   │   ├── cache.service.ts
│   │   └── story.service.ts
│   │
│   ├── data/               # Sports API fetchers
│   │   ├── fetcher.manager.ts    # Master fetcher
│   │   ├── nba.fetcher.ts
│   │   ├── nfl.fetcher.ts
│   │   └── mlb.fetcher.ts
│   │
│   ├── ml/                 # Python microservice caller
│   │   ├── ml.client.ts          # HTTP calls to Python
│   │   ├── injury.ml.ts          # Injury model calls
│   │   ├── decisions.ml.ts       # EV model calls
│   │   └── momentum.ml.ts        # Cox model calls
│   │
│   ├── db/                 # Database layer
│   │   ├── prisma.client.ts      # Prisma singleton
│   │   └── seed.ts               # Initial data seeding
│   │
│   ├── jobs/               # Background jobs
│   │   ├── queue.manager.ts
│   │   ├── data.sync.job.ts      # Pulls fresh sports data
│   │   ├── risk.compute.job.ts   # Recomputes risk scores
│   │   └── momentum.job.ts       # Recomputes momentum
│   │
│   ├── middleware/         # Express middleware
│   │   ├── error.middleware.ts
│   │   ├── cors.middleware.ts
│   │   ├── logger.middleware.ts
│   │   └── cache.middleware.ts
│   │
│   ├── utils/              # Shared utilities
│   │   ├── response.util.ts      # Standard API response format
│   │   ├── validator.util.ts     # Request validation
│   │   └── logger.util.ts        # Winston logger
│   │
│   ├── types/              # TypeScript interfaces
│   │   ├── injury.types.ts
│   │   ├── decision.types.ts
│   │   ├── momentum.types.ts
│   │   └── shared.types.ts
│   │
│   └── app.ts              # Express app setup
│
├── prisma/
│   └── schema.prisma       # Full database schema
│
├── python_ml/              # Python microservice
│   ├── main.py             # FastAPI app
│   ├── injury_model.py
│   ├── decision_model.py
│   ├── momentum_model.py
│   └── requirements.txt
│
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── nodemon.json
```

**1.3 — Express App Setup**
```
Setup Express with TypeScript
Register all middleware
├── CORS configuration
├── JSON body parser
├── Request logger
├── Error handler
└── Rate limiter
Setup Swagger documentation
Setup health check route
Connect Prisma to SQLite
```

**1.4 — Environment Variables**
```
PORT
DATABASE_URL
PYTHON_ML_SERVICE_URL
CACHE_TTL_SHORT          → 6 hours
CACHE_TTL_MEDIUM         → 24 hours
CACHE_TTL_LONG           → 7 days
NODE_ENV
LOG_LEVEL
```

---

# PHASE 2 — Database Setup

### What This Phase Does
Designs and creates all SQLite tables via Prisma
Seeds initial reference data

### Tasks

**2.1 — Prisma Schema Design**

```
Sports Table
├── id
├── name           → "NBA" / "NFL" / "MLB" / "NHL"
├── active         → boolean
└── config         → JSON (sport specific settings)

Teams Table
├── id
├── sportId        → references Sports
├── name
├── abbreviation
├── city
└── externalId     → ID from sports API

Players Table
├── id
├── teamId         → references Teams
├── name
├── position
├── age
├── externalId     → ID from sports API
└── active         → boolean

PlayerGameLogs Table
├── id
├── playerId       → references Players
├── gameId         → references Games
├── date
├── minutesPlayed
├── distanceCovered
├── highIntensityEvents
├── backToBack     → boolean
└── rawData        → JSON (full box score stored)

InjuryRiskScores Table
├── id
├── playerId       → references Players
├── computedAt
├── riskScore      → 0 to 100
├── zone           → "green" / "yellow" / "red"
├── triggerMetric  → what caused the flag
├── explanation    → plain English text
└── windowData     → JSON (the 7 day data used)

Games Table
├── id
├── sportId        → references Sports
├── homeTeamId     → references Teams
├── awayTeamId     → references Teams
├── date
├── season
├── gameType       → "regular" / "playoff"
├── homeScore
├── awayScore
└── externalId

PlayByPlay Table
├── id
├── gameId         → references Games
├── eventTime
├── quarter
├── teamId
├── eventType
├── description
├── homeScore
├── awayScore
├── scoreDiff
└── rawEvent       → JSON

CoachDecisions Table
├── id
├── gameId         → references Games
├── coachId        → references Coaches (new table)
├── decisionType   → "4th_down" / "timeout" / "2pt" etc
├── gameContext    → JSON (score, time, field position)
├── chosenAction
├── alternativeActions → JSON array
├── evChosen
├── evBest
├── isOptimal      → boolean
└── outcome        → what actually happened

DecisionEVScores Table
├── id
├── coachId
├── sport
├── season
├── decisionType
├── totalDecisions
├── optimalDecisions
├── evRate         → percentage correct
└── computedAt

MomentumAnalysis Table
├── id
├── sport
├── season
├── hazardCoefficient
├── pValue
├── confidenceIntervalLow
├── confidenceIntervalHigh
├── isSignificant  → boolean
├── plainExplanation
└── computedAt

MomentumGameData Table
├── id
├── gameId         → references Games
├── timelineData   → JSON (momentum score at each moment)
└── computedAt

CacheMetadata Table
├── id
├── cacheKey
├── dataType
├── cachedAt
├── expiresAt
└── isValid

Coaches Table
├── id
├── teamId
├── name
├── externalId
└── active
```

**2.2 — Seed Data**
```
Seed all sports records
Seed all team records for NBA and NFL first
Setup initial cache metadata
```

---

# PHASE 3 — Data Fetching Layer

### What This Phase Does
Builds all the sports API connectors
Pulls real data and stores in SQLite

### Tasks

**3.1 — NBA Data Fetcher**
```
Source → balldontlie API (free, no key for basic)
         OR nba_api Python wrapper called via microservice

Fetch
├── All NBA teams
├── All NBA players per team
├── Player game logs (full season)
├── Play by play per game
└── Schedule and game results

Store everything in SQLite tables
Log fetch time in CacheMetadata
```

**3.2 — NFL Data Fetcher**
```
Source → nfl-data-py via Python microservice
         OR ESPN public API

Fetch
├── All NFL teams
├── All NFL coaches
├── Play by play data
├── Game logs
└── 4th down decisions extracted from plays

Store in SQLite
```

**3.3 — MLB Data Fetcher**
```
Source → pybaseball via Python microservice
         Statcast data

Fetch
├── Teams and players
├── Game logs
└── Play by play

Store in SQLite
```

**3.4 — Fetcher Manager**
```
Master coordinator that
├── Checks cache before fetching
├── Decides which fetcher to call
├── Handles rate limiting per API
├── Retries on failure
└── Logs all fetch operations
```

---

# PHASE 4 — Python ML Microservice

### What This Phase Does
Builds the entire AI and statistical layer
Node.js calls this service for all heavy computation

### Tasks

**4.1 — FastAPI Setup**
```
Simple FastAPI app
All routes return JSON
Runs on port 8001
Node.js calls it internally
```

**4.2 — Injury Risk Model**
```
Input
├── Player's last 21 days of game logs
└── Most recent 7 day window

Processing
├── Compute personal baseline per metric
│   ├── Mean minutes over 21 days
│   ├── Mean distance over 21 days
│   └── Mean high intensity events
├── Run z-score on 7 day window
│   └── (current value - baseline mean) / baseline std
├── Flag if z-score > 1.5 on any metric
├── Compute composite risk score 0 to 100
└── Generate plain English explanation

Output
├── riskScore
├── zone (green/yellow/red)
├── triggerMetric
├── zScores per metric
└── explanation text
```

**4.3 — Decision EV Model**
```
Input
├── Game context (score, time, down, field position)
├── Decision type
└── Historical outcomes for similar contexts

Processing
├── Logistic regression win probability model
│   └── Trained on historical game data
├── Calculate EV for each available option
│   └── EV = probability of winning × value
├── Compare chosen option to best option
└── Label optimal or not optimal

Output
├── evChosen
├── evBest
├── isOptimal
├── winProbabilityBefore
├── winProbabilityAfter
└── alternativeOptions with their EVs

AI Enhancement
└── Fine tuned on last 5 seasons of data
    per sport for better accuracy
```

**4.4 — Momentum Cox Model**
```
Input
├── Full play by play for a game or season
└── Scoring event sequence

Processing
├── Cox proportional hazard model via lifelines
│   └── Predicts hazard rate of opponent scoring
├── Covariates
│   ├── Consecutive points scored
│   ├── Time since last score
│   ├── Score differential
│   └── Game period
├── Compute hazard coefficient
├── Run statistical significance test
└── Generate confidence intervals

Output
├── hazardCoefficient
├── pValue
├── isSignificant
├── effectSize
├── plainExplanation
└── gameTimeline (momentum score per moment)
```

**4.5 — Story Mode Generator**
```
Input
├── Current module data
├── Sport and role selected
└── Key metrics

Processing
├── Template based text generation
├── Rule based narrative builder
└── Optional → OpenAI API call for richer text
    (only if API key provided, not required)

Output
└── Plain English paragraph summarizing the screen
```

**4.6 — Timeout Optimizer**
```
Input
├── Sport
├── Current momentum score
└── Game situation

Processing
├── Decision tree trained on historical timeout data
├── Calculates stop probability with/without timeout
└── Recommends optimal timeout moment

Output
├── shouldCallTimeout boolean
├── stopProbabilityWithTimeout
├── stopProbabilityWithout
└── recommendation text
```

---

# PHASE 5 — Core API Routes

### What This Phase Does
Builds all Express routes and controllers
Everything the frontend will call

### Tasks

**5.1 — Injury Routes**
```
GET /api/injury/player/:playerId
├── Calls injury service
├── Service checks DB for recent risk score
├── If stale → calls Python ML for recompute
└── Returns full risk profile

GET /api/injury/team/:teamId
├── Gets all players on team
├── Returns risk score for each
└── Sorted by risk level

GET /api/injury/alerts/:sport
├── Returns all players currently in red zone
└── Across entire sport/league
```

**5.2 — Decision Routes**
```
GET /api/decisions/coaches/:sport
├── Returns full coach leaderboard
├── Sorted by EV rate
└── With filter options (season, decision type)

GET /api/decisions/coach/:coachId
├── Returns all decisions for one coach
├── Color coded optimal vs not
└── With game context for each

GET /api/decisions/game/:gameId
└── All decisions made in one specific game
```

**5.3 — Momentum Routes**
```
GET /api/momentum/analysis/:sport
├── Returns statistical findings for sport
└── Hazard coefficient, p-value, explanation

GET /api/momentum/game/:gameId
├── Returns full momentum timeline for game
└── Score at each moment in the game

GET /api/momentum/comparison
└── All sports side by side comparison data

GET /api/momentum/timeout/:sport
└── Timeout optimizer recommendations
```

**5.4 — Shared Routes**
```
GET /api/search/players?q=
└── Player autocomplete search

GET /api/search/teams?q=
└── Team autocomplete search

GET /api/story/:module/:sport
└── Story mode text for current view

GET /api/health
└── Server status check

GET /api/sports
└── All supported sports and their configs
```

---

# PHASE 6 — Background Jobs

### What This Phase Does
Runs data sync and computation automatically
Keeps everything fresh without manual triggers

### Tasks

**6.1 — Data Sync Job**
```
Runs every 6 hours
├── Fetches latest game logs for all players
├── Fetches latest play by play data
├── Updates SQLite tables
└── Marks cache as refreshed
```

**6.2 — Risk Compute Job**
```
Runs every 6 hours after data sync
├── Loops through all active players
├── Sends workload data to Python ML service
├── Stores new risk scores in DB
└── Flags any new red zone players
```

**6.3 — Momentum Compute Job**
```
Runs daily
├── Pulls all games from last 24 hours
├── Sends play by play to Python ML
├── Stores momentum timeline in DB
└── Updates season level analysis
```

---

# PHASE 7 — Caching Layer

### What This Phase Does
Makes the app feel instant
Prevents hammering sports APIs

### Tasks

**7.1 — In Memory Cache**
```
Node-cache setup
├── Player search results     → 1 hour TTL
├── Team lists                → 24 hour TTL
└── Active alerts             → 30 minute TTL
```

**7.2 — SQLite Cache**
```
Stored computation results
├── Risk scores               → 6 hour TTL
├── Coach leaderboard         → 24 hour TTL
├── Momentum analysis         → 24 hour TTL
└── Story mode text           → 1 hour TTL
```

**7.3 — Cache Middleware**
```
Every route checks cache first
├── Hit → return immediately
├── Miss → compute, store, return
└── Stale → return stale, recompute in background
```

---

# PHASE 8 — Error Handling and Logging

### What This Phase Does
Makes the backend robust and debuggable

### Tasks

**8.1 — Error Handling**
```
Global error middleware catches all errors
├── API fetch failures → return cached data or graceful message
├── ML service down → return last computed score from DB
├── DB errors → log and return safe error response
└── Unknown errors → log, return 500 with safe message
```

**8.2 — Logging**
```
Winston logger
├── All API requests logged
├── All data fetch operations logged
├── All ML calls logged with response time
├── All errors logged with full stack
└── Log files saved locally, displayed in console
```

---

# PHASE 9 — Testing and Docs

### What This Phase Does
Makes sure everything works
Documents every endpoint

### Tasks

**9.1 — API Documentation**
```
Swagger UI auto generated
Available at /api/docs
Every route documented with
├── Parameters
├── Response schema
└── Example response
```

**9.2 — Basic Testing**
```
Test each route returns correct shape
Test cache is working
Test ML service integration
Test error cases return safe responses
```

---

## Full Phase Summary

| Phase | What It Builds | Priority |
|---|---|---|
| Phase 1 | Project foundation and structure | Must do first |
| Phase 2 | SQLite database and all tables | Must do second |
| Phase 3 | Sports data fetching layer | Core feature |
| Phase 4 | Python ML microservice | Core feature |
| Phase 5 | All API routes and controllers | Core feature |
| Phase 6 | Background jobs for data sync | Important |
| Phase 7 | Caching layer | Important |
| Phase 8 | Error handling and logging | Important |
| Phase 9 | Testing and documentation | Final polish |

---

## Build Order for Speed

```
Phase 1 → Phase 2 → Phase 4 → Phase 3 → Phase 5 → Phase 7 → Phase 6 → Phase 8 → Phase 9
```

**Why this order:**
- Get ML working before data fetching so you can test models with mock data
- Get routes working before jobs so you can test manually
- Caching before jobs so jobs use the cache system properly

This is the complete backend plan. Every phase, every function, every table, every route. Ready to start building when you say go.