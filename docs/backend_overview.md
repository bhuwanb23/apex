# AQX Sports Intelligence — Backend Development Phases
 
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
├── plain