# Phase 6 — Background Jobs — Step by Step

---

## Overview of Steps

```
Step 1 → Understand background job architecture
Step 2 → Setup job infrastructure
Step 3 → Setup job scheduler
Step 4 → Build job manager
Step 5 → Build data sync job (6.1)
Step 6 → Build risk compute job (6.2)
Step 7 → Build momentum compute job (6.3)
Step 8 → Build job monitoring and logging
Step 9 → Build job control routes
Step 10 → Test all jobs
```

---

## Step 1 — Understand Background Job Architecture

**What background jobs are:**
```
Jobs are functions that run automatically
on a schedule without anyone triggering them
Like a cron job but inside the Node.js app
```

**Why we need them:**
```
Sports data changes constantly
New games played every day
Player workloads update every game
Without background jobs
├── Data goes stale immediately
├── Risk scores become outdated
├── Judges see old data in demo
└── The whole platform loses credibility

With background jobs
├── Data always fresh automatically
├── Risk scores recomputed after every game
├── Momentum updated daily
└── App feels live and real
```

**Job scheduling library:**
```
node-cron
├── Simple and lightweight
├── Standard cron syntax
├── No external dependencies needed
├── No Redis or separate queue server
├── Perfect for hackathon scale
└── Runs inside Node process
```

**Job execution model:**
```
App starts
    ↓
Scheduler registers all jobs with their schedules
    ↓
Jobs run in background on their schedule
    ↓
Each job
├── Logs start
├── Does its work
├── Logs completion with stats
└── Handles its own errors without crashing app

One job failure never stops other jobs
One job failure never crashes the server
```

**Job priority and order:**
```
Data Sync Job runs first
    ↓ (waits for sync to complete)
Risk Compute Job runs after data sync
    ↓ (separate schedule)
Momentum Job runs daily independently
```

**Full job schedule:**
```
Data Sync Job        → Every 6 hours
                       0:00, 6:00, 12:00, 18:00

Risk Compute Job     → Every 6 hours
                       1:00, 7:00, 13:00, 19:00
                       (1 hour after sync to ensure data is ready)

Momentum Job         → Once daily
                       2:00 AM
                       (after sync and risk are done)

Cleanup Job          → Once daily
                       3:00 AM
                       (housekeeping)

Health Check Job     → Every 15 minutes
                       Verify ML service is alive
```

---

## Step 2 — Setup Job Infrastructure

**New files to create:**
```
src/jobs/
├── queue.manager.ts          → Controls all job registration
├── job.runner.ts             → Safe execution wrapper
├── scheduler.ts              → Cron schedule definitions
├── data.sync.job.ts          → Data sync job logic
├── risk.compute.job.ts       → Risk score computation
├── momentum.job.ts           → Momentum computation
├── cleanup.job.ts            → Database housekeeping
└── health.check.job.ts       → ML service health monitoring
```

**New table needed — JobLogs:**
```
This table tracks every job run
So we can see history and debug failures

Fields
├── id              → Auto increment primary key
├── jobName         → "data_sync" / "risk_compute" etc
├── sport           → Which sport this run covered
├── status          → "running" / "completed" / "failed"
├── startedAt       → When job started
├── completedAt     → When job finished (null if running)
├── durationSeconds → How long it took
├── recordsProcessed → How many records handled
├── errors          → JSON array of any errors encountered
├── summary         → JSON with job specific stats
└── triggeredBy     → "scheduler" / "manual" / "startup"
```

**Add this to Prisma schema in Phase 2 DB**
```
This table gets added now
Run a Prisma migration to add it
```

---

## Step 3 — Setup Job Scheduler

**File:** src/jobs/scheduler.ts

**What this file does:**
```
Defines all cron schedules
Registers each job with node-cron
Starts all scheduled jobs
Exports controls to start and stop
```

**Cron syntax used:**
```
node-cron uses standard cron format
"minute hour day month weekday"

Every 6 hours at minute 0
→ "0 0,6,12,18 * * *"

Every 6 hours at minute 0 offset by 1 hour
→ "0 1,7,13,19 * * *"

Once daily at 2 AM
→ "0 2 * * *"

Once daily at 3 AM
→ "0 3 * * *"

Every 15 minutes
→ "*/15 * * * *"
```

**Scheduler responsibilities:**
```
On app startup
├── Register data sync job    → 6 hour schedule
├── Register risk compute job → 6 hour offset schedule
├── Register momentum job     → daily at 2 AM
├── Register cleanup job      → daily at 3 AM
└── Register health check job → every 15 minutes

After registration
├── Log all registered jobs
├── Log their next run times
└── Optionally run jobs immediately on startup
    Configurable via environment variable
    RUN_JOBS_ON_STARTUP=true
```

**Preventing overlapping runs:**
```
If a job is still running when next schedule fires
Skip the new trigger
Log a warning that job overlap was prevented
This prevents data corruption from parallel writes

Track this with a simple boolean flag per job
isDataSyncRunning = false
If isDataSyncRunning is true when cron fires
Log and skip
```

**Graceful shutdown:**
```
When Node.js process receives SIGTERM
├── Stop all scheduled jobs from firing again
├── Wait for currently running jobs to complete
├── Log shutdown complete
└── Exit process

This prevents data corruption on deployment restarts
```

---

## Step 4 — Build Job Manager

**File:** src/jobs/queue.manager.ts

**What this does:**
```
Single control point for all jobs
Any part of the app can trigger a job
through the queue manager
Not by calling job files directly
```

**Functions exported:**

```
startAllJobs()
├── Called on app startup
├── Registers all jobs with scheduler
└── Logs which jobs are active

stopAllJobs()
├── Called on graceful shutdown
└── Cancels all scheduled jobs

triggerJob(jobName, sport, triggeredBy)
├── Manually trigger any job immediately
├── Used by admin routes and startup runs
├── Returns job log ID so caller can track it
└── Runs job in background does not await it

getJobStatus(jobName)
├── Returns current status of a job
├── isRunning boolean
├── lastRunAt datetime
├── lastRunStatus "completed" / "failed"
└── nextRunAt datetime

getJobHistory(jobName, limit)
├── Returns last N job runs from JobLogs table
└── Useful for monitoring route

getRunningJobs()
└── Returns list of all currently running jobs
```

---

**File:** src/jobs/job.runner.ts

**What this does:**
```
Wraps every job function in safety layer
Handles logging, error catching, timing
Job files focus on their logic
job.runner handles the boilerplate
```

**How it works:**
```
runJob(jobName, sport, jobFunction, triggeredBy)

Before calling jobFunction
├── Check if this job is already running
│   If yes → log skip and return
├── Set job running flag to true
├── Create JobLogs record with status "running"
├── Record start time
└── Log job start with details

Call jobFunction
├── Pass any context it needs
└── Await completion

After jobFunction completes
├── Record completion time
├── Calculate duration
├── Update JobLogs record
│   ├── status → "completed" or "failed"
│   ├── completedAt → now
│   ├── durationSeconds → calculated
│   └── summary → results from job
├── Set running flag to false
└── Log job completion with duration and stats

If jobFunction throws
├── Catch the error
├── Log full error with stack
├── Update JobLogs with status "failed"
├── Set running flag to false
├── DO NOT rethrow (never crash the server)
└── Log that job failed but app continues
```

---

## Step 5 — Data Sync Job (6.1)

**File:** src/jobs/data.sync.job.ts

**Schedule:** Every 6 hours at minute 0
**Purpose:** Keep all sports data fresh in SQLite

---

### Step 5.1 — Job Entry Function

**What dataSyncJob() does:**
```
Main function called by scheduler
Runs sync for each active sport sequentially
Not in parallel (avoid rate limiting issues)

For each sport in order
├── NBA sync
├── NFL sync
└── MLB sync

Returns summary object
├── sportsProcessed
├── totalTeamsSynced
├── totalPlayersSynced
├── totalGamesSynced
├── totalLogsSynced
└── errors array
```

---

### Step 5.2 — NBA Sync Sequence

**syncNBAData():**

```
Step 1 — Check if sync needed
├── Look at CacheMetadata for NBA player_logs
├── If cachedAt was less than 6 hours ago
│   Skip sync and log "NBA data is fresh"
└── If stale proceed with sync

Step 2 — Sync teams
├── Call nba.fetcher.ts fetchTeams()
├── Transform all teams
├── Upsert to Teams table
└── Log team count

Step 3 — Sync players
├── Call fetchPlayers() for all teams
├── Transform all players
├── Upsert to Players table
└── Log player count

Step 4 — Find recent games
├── Query Games table for NBA games
    last 7 days with status "final"
├── Also fetch any new games from API
└── Upsert new games to Games table

Step 5 — Sync game logs for recent games
├── For each recent game
│   ├── Fetch box scores (player stats)
│   ├── Transform to PlayerGameLogs shape
│   └── Upsert to PlayerGameLogs table
├── Batch process 10 games at a time
└── Log total logs synced

Step 6 — Update cache metadata
├── Update CacheMetadata for NBA player_logs
├── Set cachedAt to now
├── Set expiresAt to 6 hours from now
└── Set isValid to true

Step 7 — Return sync summary
```

---

### Step 5.3 — NFL Sync Sequence

**syncNFLData():**

```
Step 1 — Check if sync needed
Same cache check as NBA

Step 2 — Sync teams and rosters
├── Call nfl fetcher for teams
├── Call nfl fetcher for rosters
├── Upsert teams and players
└── Upsert coaches if new coaching changes

Step 3 — Fetch recent play by play
├── Determine current NFL week
├── Fetch play by play for games
    completed in last 7 days
├── Transform plays to PlayByPlay shape
└── Write to PlayByPlay table

Step 4 — Extract coaching decisions
├── From the play by play data
├── Identify all 4th down plays
├── Identify all timeout events
├── Identify all 2 point conversion attempts
├── For each decision
│   ├── Build gameContext object
│   ├── Record chosenAction
│   └── Record outcome
├── Upsert to CoachDecisions table
└── Log decisions extracted count

Step 5 — Update cache metadata
Same as NBA step 6

Step 6 — Return summary
```

---

### Step 5.4 — MLB Sync Sequence

**syncMLBData():**

```
Step 1 — Check if sync needed

Step 2 — Sync teams and rosters
Fetch from MLB Stats API
Upsert teams and players

Step 3 — Fetch recent games
Get games from last 7 days with Final status
Upsert to Games table

Step 4 — Fetch box scores
For each recent game
├── Hit MLB Stats API boxscore endpoint
├── Transform player stats
└── Upsert to PlayerGameLogs

Step 5 — Fetch play by play
For each recent game
├── Hit MLB play by play endpoint
├── Transform plays
└── Upsert to PlayByPlay table

Step 6 — Update cache metadata

Step 7 — Return summary
```

---

### Step 5.5 — Sync Error Handling

**How errors are handled:**
```
Each sport sync wrapped in try catch
If NBA sync fails
├── Log full error
├── Add to errors array in summary
├── Continue to NFL sync (don't stop)
└── Report partial completion

If a specific step fails (e.g. game logs)
├── Log which step and which game failed
├── Continue with remaining games
└── Report how many succeeded vs failed

Never let one bad game or one bad sport
stop the entire sync job
```

**Partial sync detection:**
```
After all sports done
If errors array is not empty
├── Mark job status as "partial"
├── Not "completed" but not "failed" either
└── Log which parts succeeded and failed
```

---

## Step 6 — Risk Compute Job (6.2)

**File:** src/jobs/risk.compute.job.ts

**Schedule:** Every 6 hours at minute 0 offset +1 hour
**Purpose:** Recompute injury risk scores for all active players

---

### Step 6.1 — Job Entry Function

**What riskComputeJob() does:**
```
Called 1 hour after data sync completes
Ensures fresh game log data is in DB first

Processes one sport at a time
For each sport
├── Get all active players
├── Batch process risk computations
└── Flag new red zone players

Returns summary
├── playersProcessed
├── newRedZonePlayers    → newly flagged
├── newGreenPlayers      → previously red now green
├── errorsCount
└── averageRiskScore     → interesting stat to log
```

---

### Step 6.2 — Player Batch Processing

**How batching works:**
```
Get all active players for sport
Could be 500+ players for NBA

Don't process one at a time (too slow)
Don't process all at once (overwhelms Python)

Process in batches of 25 players

For each batch of 25
├── Fetch game logs for all 25 from DB
│   One query with WHERE playerId IN (...)
│   Last 21 days of logs per player
├── Send all 25 to Python ML service
│   Batch endpoint processes multiple at once
├── Receive 25 risk scores back
├── Write all 25 to InjuryRiskScores
│   Set isLatest false on old scores first
│   Set isLatest true on new scores
└── Wait 200ms before next batch
    Small delay to not overwhelm Python
```

---

### Step 6.3 — Game Log Preparation

**What we send to Python per player:**
```
For each player we build
├── playerId
├── playerName
├── sport
└── gameLogs array
    Each log contains
    ├── date
    ├── minutesPlayed
    ├── distanceCovered
    ├── highIntensityEvents
    ├── backToBack
    └── daysRestBefore

Only include logs from last 21 days
Sort by date descending most recent first
Minimum 3 games needed to compute
If less than 3 games skip this player
Log skipped players
```

---

### Step 6.4 — Saving Risk Scores

**How results are written to DB:**
```
Receive array of risk results from Python
For each result

Step 1 — Mark old score as not latest
UPDATE InjuryRiskScores
SET isLatest = false
WHERE playerId = thisPlayerId
AND isLatest = true

Step 2 — Insert new score
INSERT into InjuryRiskScores
├── playerId
├── riskScore
├── zone
├── triggerMetric
├── all z-scores
├── explanation
├── isLatest = true
├── windowStart
├── windowEnd
└── computedAt = now

Use a transaction for both steps
Ensures we never have duplicate isLatest records
```

---

### Step 6.5 — Red Zone Flagging

**What happens when a player enters red zone:**
```
After writing all scores
Query for players whose zone changed

New red zone players
├── Previous score had zone "green" or "yellow"
├── New score has zone "red"
└── This is notable — log prominently

Players who left red zone
├── Previous score had zone "red"
├── New score has zone "green" or "yellow"
└── Log as recovery

Log both lists clearly in job summary
In a real production app
this would trigger push notifications
For MVP we just log it
```

---

### Step 6.6 — Risk Compute Error Handling

```
If Python ML service is down
├── Log "ML service unavailable"
├── Skip risk computation for all players
├── Mark job as failed
└── Do not wipe existing scores
   Old scores stay in DB
   App still serves last known scores
   With a "last updated X hours ago" note

If individual player computation fails
├── Log player ID and error
├── Skip that player
├── Continue with rest of batch
└── Track failed player count in summary

If DB write fails for a batch
├── Log which batch failed
├── Retry that batch once
├── If retry fails log and continue
└── Do not retry more than once
```

---

## Step 7 — Momentum Compute Job (6.3)

**File:** src/jobs/momentum.job.ts

**Schedule:** Daily at 2:00 AM
**Purpose:** Update momentum timelines and season analysis

---

### Step 7.1 — Job Entry Function

**What momentumJob() does:**
```
Runs once per day
Two main tasks

Task A — Game timeline computation
└── Compute momentum timeline for games
    played in last 24 hours

Task B — Season analysis update
└── Rerun Cox model on full season data
    for each sport
    Updates MomentumAnalysis table

Returns summary
├── gamesProcessed
├── sportsAnalyzed
├── coxModelUpdated    → boolean
└── errorsCount
```

---

### Step 7.2 — Task A — Game Timeline Computation

**Processing recent games:**
```
Step 1 — Find games from last 24 hours
Query Games table
WHERE date >= 24 hours ago
AND status = "final"
AND no MomentumGameData record exists yet

Step 2 — For each game
├── Fetch all plays from PlayByPlay table
│   WHERE gameId = thisGameId
│   ORDER BY eventTimeSeconds ascending
├── Filter to scoring events only
│   WHERE isScoring = true
└── Build play sequence array

Step 3 — Send to Python
POST to /momentum/compute-game
Body contains gameId and plays array

Step 4 — Receive timeline
├── homeTeamMomentum array
├── awayTeamMomentum array
├── timelineEvents array
└── summary stats

Step 5 — Write to MomentumGameData
├── Check if record exists for gameId
├── If exists update it
├── If not exists insert
└── Set computedAt to now

Process games sequentially not in parallel
Each game computation takes a few seconds
Parallel would overwhelm Python service
```

---

### Step 7.3 — Task B — Season Analysis Update

**How Cox model is updated:**
```
Run for each active sport separately

Step 1 — Fetch all scoring plays for season
Query PlayByPlay table
WHERE sportId = thisSport
AND isScoring = true
AND date >= start of current season
ORDER BY gameId, eventTimeSeconds

Could be 50,000+ records for NBA season
This is fine — pandas handles it easily

Step 2 — Send to Python
POST to /momentum/compute-season
Body contains sport, season, and plays array

This takes longer than game computation
Typically 10-30 seconds for Cox model

Step 3 — Receive Cox model results
├── hazardCoefficient
├── pValue
├── confidenceIntervals
├── isSignificant
└── explanations

Step 4 — Update MomentumAnalysis table
├── Find existing record for sport + season
├── If exists → update all fields
├── If not exists → insert new record
└── Set computedAt to now

Step 5 — Invalidate cached momentum responses
├── Call cache service
└── Invalidate all cached /momentum/analysis responses
    for this sport
    Next API call will get fresh data from DB
```

---

### Step 7.4 — Momentum Job Error Handling

```
If play by play data missing for a game
├── Log which game has no play data
├── Skip that game
└── Continue with other games

If Python momentum computation fails
├── Log error with game ID or sport
├── Keep existing MomentumGameData if it exists
└── Do not delete old data on failure

If Cox model fails for a sport
├── Log sport and full error
├── Keep existing MomentumAnalysis record
└── Log that season analysis is from previous run

Season analysis failure is not catastrophic
Old analysis data is still valid and useful
Log clearly when it was last successfully computed
```

---

## Step 8 — Cleanup Job

**File:** src/jobs/cleanup.job.ts

**Schedule:** Daily at 3:00 AM
**Purpose:** Keep database clean and performant

---

### What cleanup does:

```
Task 1 — Clean old risk scores
├── InjuryRiskScores where isLatest is false
│   and computedAt is older than 30 days
└── Delete them
    Keep recent history but not forever

Task 2 — Clean expired story logs
├── StoryLogs where expiresAt is in the past
└── Delete them

Task 3 — Clean old job logs
├── JobLogs older than 14 days
└── Delete them
    We only need recent history

Task 4 — Clean invalid cache metadata
├── CacheMetadata where isValid is false
│   and updatedAt is older than 7 days
└── Delete them

Task 5 — Clean expired timeout recommendations
├── TimeoutRecommendations where computedAt
│   is older than 30 days
└── Delete and schedule recomputation

Task 6 — Log cleanup summary
├── Records deleted per table
└── Current record counts per table
```

---

## Step 9 — Health Check Job

**File:** src/jobs/health.check.job.ts

**Schedule:** Every 15 minutes
**Purpose:** Monitor Python ML service availability

---

### What health check does:

```
Every 15 minutes
├── Call Python ML service /health endpoint
│   Timeout of 5 seconds
├── If responds with 200
│   ├── Log "ML service healthy"
│   └── Update internal status flag
│       mlServiceAvailable = true
└── If fails or times out
    ├── Log warning "ML service unreachable"
    ├── Update internal status flag
    │   mlServiceAvailable = false
    └── If this is 3rd consecutive failure
        Log error level alert
        "ML service has been down for 30+ minutes"
```

**Why this matters:**
```
The Node.js API routes check mlServiceAvailable
Before trying to call Python
If false → serve cached/DB data immediately
No waiting for timeouts on every request
App stays fast even when Python is down
```

**Exposing health status:**
```
mlServiceAvailable flag stored in module scope
Any service file can import and check it
Risk compute job checks it before starting
Returns immediately if Python is down
```

---

## Step 10 — Job Control Routes

**File:** src/routes/jobs.routes.ts

**Purpose:**
```
HTTP endpoints to manually control jobs
Useful during demo and development
Judges can trigger a fresh data sync
without restarting the server
```

---

**Route — GET /api/jobs/status:**
```
Returns current status of all jobs
├── Each job name
├── isRunning boolean
├── lastRunAt
├── lastRunStatus
├── nextRunAt
└── mlServiceAvailable
```

---

**Route — GET /api/jobs/history:**
```
Query parameters
├── jobName → filter by specific job
└── limit   → number of records default 10

Returns recent job runs from JobLogs table
Each run shows
├── status
├── duration
├── recordsProcessed
├── errors
└── summary
```

---

**Route — POST /api/jobs/trigger:**
```
Body
├── jobName → which job to run
└── sport   → optional sport filter

Manually triggers any job immediately
Returns job log ID
Frontend or developer can poll /jobs/history
to see when it completes

Protected by simple header check
Require X-Admin-Key header matching env variable
Not full auth just basic protection
```

---

**Route — GET /api/jobs/ml-health:**
```
Returns current ML service health
├── available    → boolean
├── lastChecked  → timestamp
├── consecutiveFailures → count
└── models       → which models are loaded
```

---

## Step 10 — Testing All Jobs

**Testing approach:**
```
Set RUN_JOBS_ON_STARTUP=true temporarily
Watch logs as server starts
Verify each job runs in correct order
Then test manual trigger route
```

---

**Test 1 — Data Sync Job:**
```
□ Trigger data sync via POST /api/jobs/trigger
  Body → jobName: "data_sync"
□ Watch logs for
  "Starting NBA data sync"
  "Teams synced: 30"
  "Players synced: ~500"
  "Games synced: ~X"
  "Game logs synced: ~X"
  "NBA sync complete"
□ Query SQLite to verify data
  SELECT COUNT(*) FROM players WHERE sportId = 1
  Should show 500+ players
□ Check CacheMetadata table
  Should have fresh entries for NBA
□ Trigger again immediately
  Should detect fresh cache and skip
  Log "NBA data is fresh, skipping sync"
```

---

**Test 2 — Risk Compute Job:**
```
□ Ensure data sync has run first
□ Trigger risk compute via jobs trigger route
□ Watch logs for
  "Processing 25 player batch 1 of X"
  "Batch 1 complete: 25 risk scores computed"
  "New red zone players: [names]"
  "Risk compute complete"
□ Query InjuryRiskScores table
  SELECT * FROM InjuryRiskScores WHERE isLatest = true
  Should have one record per active player
□ Verify no duplicate isLatest = true
  per player
□ Test with ML service down
  Stop Python service
  Trigger risk compute
  Should log failure gracefully
  Should not delete existing scores
  Restart Python service
```

---

**Test 3 — Momentum Job:**
```
□ Trigger momentum job
□ Watch logs for game timeline computation
□ Verify MomentumGameData records created
  for recent games
□ Verify MomentumAnalysis updated
  for each sport
□ Check computedAt is recent
□ Call /api/momentum/analysis/NBA
  Should return fresh data
  computedAt should match job run time
```

---

**Test 4 — Cleanup Job:**
```
□ Insert some dummy old records
  Fake InjuryRiskScores with isLatest false
  and computedAt 31 days ago
□ Trigger cleanup job
□ Verify those records deleted
□ Verify recent records untouched
□ Check job summary log
  Shows correct deleted counts
```

---

**Test 5 — Health Check Job:**
```
□ Start both servers normally
□ Wait 15 minutes or trigger manually
□ Verify log shows "ML service healthy"
□ Stop Python service
□ Wait for next health check
□ Verify log shows "ML service unreachable"
□ Check GET /api/jobs/ml-health
  Shows available: false
□ Restart Python service
□ Next health check should restore to healthy
```

---

**Test 6 — Overlap Prevention:**
```
□ Trigger data sync job
□ While it is running trigger it again
□ Verify second trigger is skipped
□ Log should show
  "Data sync already running, skipping"
□ Wait for first run to complete
□ Trigger again
□ Should run normally
```

---

**Test 7 — Graceful Shutdown:**
```
□ Trigger a long running job (data sync)
□ While running send SIGTERM to process
  Ctrl+C in terminal
□ Verify log shows
  "Graceful shutdown initiated"
  "Waiting for running jobs to complete"
  Job completion log
  "Shutdown complete"
□ Check DB for data integrity
  No partial writes
  No corrupt records
```

---

## Phase 6 Complete File List

```
src/jobs/
├── queue.manager.ts          ← new
├── job.runner.ts             ← new
├── scheduler.ts              ← new
├── data.sync.job.ts          ← new
├── risk.compute.job.ts       ← new
├── momentum.job.ts           ← new
├── cleanup.job.ts            ← new
└── health.check.job.ts       ← new

src/routes/
└── jobs.routes.ts            ← new

Prisma schema addition
└── JobLogs table             ← new migration needed
```

---

## Phase 6 Summary

| Step | What It Builds | Key Output |
|---|---|---|
| Step 1 | Architecture understanding | Job model clear |
| Step 2 | Job infrastructure | Folders files JobLogs table |
| Step 3 | Job scheduler | Cron schedules registered |
| Step 4 | Job manager | Central job control |
| Step 5 | Data sync job | Fresh data every 6 hours |
| Step 6 | Risk compute job | Risk scores updated automatically |
| Step 7 | Momentum job | Momentum fresh daily |
| Step 8 | Cleanup job | DB stays clean |
| Step 9 | Health check job | ML service monitored |
| Step 10 | Job control routes | Manual trigger and status |
| Step 11 | Testing | All jobs verified |

---

## What Phase 6 Delivers

```
After Phase 6 is complete

The app runs itself
├── Data syncs every 6 hours automatically
├── Risk scores recomputed after every sync
├── Momentum updated every morning
├── Database stays clean automatically
└── ML service health monitored constantly

For the hackathon demo this means
├── Judges see fresh real data
├── No manual data loading needed
├── Start the app and everything works
├── Can show job history to prove it ran
└── Professional level operational system

The backend is now complete
├── Phase 1 → Foundation
├── Phase 2 → Database
├── Phase 3 → Data fetching
├── Phase 4 → ML models
├── Phase 5 → API routes
└── Phase 6 → Background jobs running it all
```

**Phase 6 transforms the backend from a static tool**
**into a living system that maintains itself**
**This is what separates a real product from a demo**