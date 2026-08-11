# Phase 5 — Core API Routes — Step by Step

---

## Overview of Steps

```
Step 1 → Understand the routing architecture
Step 2 → Setup shared types and interfaces
Step 3 → Setup route registration in app.ts
Step 4 → Build shared routes
Step 5 → Build injury routes and controller
Step 6 → Build decision routes and controller
Step 7 → Build momentum routes and controller
Step 8 → Build search routes and controller
Step 9 → Build story routes and controller
Step 10 → Build ML client layer
Step 11 → Build service layer
Step 12 → Test all routes
```

---

## Step 1 — Understand the Routing Architecture

**How a request flows through the system:**
```
Frontend makes HTTP request
        ↓
Express Router (routes file)
Matches URL pattern
Calls correct controller function
        ↓
Controller
Validates incoming request
Calls service layer
Sends response back
        ↓
Service Layer
Contains business logic
Checks cache first
Calls DB or ML client
Returns clean data
        ↓
ML Client (if needed)
Makes HTTP call to Python service
Returns model results
        ↓
Database Layer
Reads or writes SQLite via Prisma
Returns data
        ↓
Response flows back up the chain
Controller sends final JSON to frontend
```

**Why this layered approach:**
```
Routes     → only know about URLs and HTTP
Controllers → only know about request and response
Services   → only know about business logic
ML Client  → only knows about Python communication
Database   → only knows about data storage

Each layer has one job
Changing one layer does not break others
Easy to test each layer independently
```

---

## Step 2 — Setup Shared Types and Interfaces

**File:** src/types/shared.types.ts

**What lives here:**
```
All TypeScript interfaces used across multiple modules
Defined once, imported everywhere
```

**Sport type:**
```
Union type of all supported sports
"NBA" | "NFL" | "MLB" | "NHL"
Used in every route that accepts a sport parameter
```

**Role type:**
```
Union type of all user roles
"trainer" | "coach" | "analyst" | "fan"
Used in story and dashboard routes
```

**Standard API response interface:**
```
Every route returns this exact shape
├── success     → boolean
├── status      → HTTP status number
├── data        → the actual payload (generic type)
├── message     → optional string
└── timestamp   → ISO string
```

**Paginated response interface:**
```
For list endpoints that return many records
├── success
├── data        → array of items
├── meta
│   ├── page
│   ├── limit
│   ├── total
│   ├── totalPages
│   └── hasNext
└── timestamp
```

**Error response interface:**
```
├── success     → always false
├── status      → HTTP error code
├── message     → human readable error
├── errorCode   → machine readable code string
└── timestamp
```

**Date range interface:**
```
├── startDate   → ISO date string
└── endDate     → ISO date string
Used in filter parameters across all modules
```

---

**File:** src/types/injury.types.ts

```
PlayerRiskProfile interface
├── playerId
├── playerName
├── teamId
├── teamName
├── sport
├── riskScore
├── zone
├── triggerMetric
├── minutesZScore
├── distanceZScore
├── intensityZScore
├── backToBackFlag
├── baselineMeanMinutes
├── explanation
├── windowStart
├── windowEnd
└── computedAt

TeamRiskSummary interface
├── teamId
├── teamName
├── sport
├── players        → array of PlayerRiskProfile
├── redCount
├── yellowCount
├── greenCount
└── lastUpdated

RiskAlert interface
├── playerId
├── playerName
├── teamName
├── riskScore
├── zone
├── triggerMetric
└── explanation
```

---

**File:** src/types/decision.types.ts

```
CoachScorecard interface
├── coachId
├── coachName
├── teamName
├── sport
├── season
├── decisionType
├── totalDecisions
├── optimalDecisions
├── evRate
├── avgEvDifference
├── rank
└── computedAt

DecisionDetail interface
├── id
├── gameId
├── gameDate
├── opponent
├── decisionType
├── period
├── clock
├── scoreDiff
├── chosenAction
├── evChosen
├── evBest
├── evDifference
├── isOptimal
├── alternativeActions
├── outcome
└── explanation

CoachLeaderboard interface
├── sport
├── season
├── decisionType
├── coaches        → array of CoachScorecard
└── generatedAt
```

---

**File:** src/types/momentum.types.ts

```
MomentumResult interface
├── sport
├── season
├── hazardCoefficient
├── pValue
├── confidenceIntervalLow
├── confidenceIntervalHigh
├── isSignificant
├── effectSize
├── gamesAnalyzed
├── verdictLabel
├── plainExplanation
├── shortExplanation
└── computedAt

GameMomentumTimeline interface
├── gameId
├── homeTeamName
├── awayTeamName
├── homeTeamMomentum   → array of numbers
├── awayTeamMomentum   → array of numbers
├── timelineEvents     → array of events
├── peakHomeMomentum
├── peakAwayMomentum
├── momentumShifts
└── longestStreak

SportComparison interface
├── sports             → array of sport results
│   Each contains
│   ├── sport
│   ├── verdictLabel
│   ├── hazardCoefficient
│   ├── pValue
│   ├── isSignificant
│   └── shortExplanation
└── generatedAt
```

---

## Step 3 — Route Registration in app.ts

**What we add to app.ts:**
```
Import all route files
Register each with a base path prefix

Route prefixes
├── /api/health       → health routes (already done Phase 1)
├── /api/injury       → injury routes
├── /api/decisions    → decision routes
├── /api/momentum     → momentum routes
├── /api/search       → search routes
├── /api/story        → story routes
└── /api/sports       → sports config routes

Order matters
├── Specific routes before wildcard routes
├── Health check registered first
└── Error handler registered last (always last)
```

**Route file structure pattern:**
```
Every route file follows same pattern
├── Import Express Router
├── Import controller functions
├── Import any middleware needed
├── Define routes with HTTP method and path
├── Attach middleware per route if needed
└── Export the router

Every controller follows same pattern
├── Import service functions
├── Import response utility
├── Import logger
├── Async function with try catch
├── Validate request params
├── Call service
└── Send response
```

---

## Step 4 — Shared Routes

**File:** src/routes/shared.routes.ts

---

### Route — GET /api/sports

**Purpose:**
```
Returns list of all supported sports
with their config and active status
Frontend uses this to populate sport selector
```

**Controller logic:**
```
Query Sports table from SQLite
Return all sports where isActive is true
Include config JSON for each
```

**Response:**
```
data
├── sports array
│   Each sport
│   ├── id
│   ├── name
│   ├── abbreviation
│   ├── season
│   └── isActive
└── total count
```

---

### Route — GET /api/sports/:sport/teams

**Purpose:**
```
Returns all teams for a given sport
Used to populate team selector dropdowns
```

**Parameters:**
```
sport → path param, one of NBA NFL MLB NHL
```

**Controller logic:**
```
Validate sport is supported
Query Teams table filtered by sportId
Return sorted by name alphabetically
```

---

### Route — GET /api/sports/:sport/players

**Purpose:**
```
Returns all active players for a sport
Used for player search population
```

**Query parameters:**
```
teamId   → optional filter by team
page     → pagination page number default 1
limit    → items per page default 50
```

**Controller logic:**
```
Validate sport
Build query with optional teamId filter
Paginate results
Return player list with team info included
```

---

## Step 5 — Injury Routes and Controller

**File:** src/routes/injury.routes.ts
**File:** src/controllers/injury.controller.ts

---

### Route — GET /api/injury/player/:playerId

**Purpose:**
```
Returns full injury risk profile for one player
The main single player view in Module 1
```

**Path parameters:**
```
playerId → integer, player's database ID
```

**Query parameters:**
```
recalculate → boolean, default false
             If true forces fresh ML calculation
             If false returns cached score from DB
```

**Controller flow:**
```
Step 1 → Validate playerId is a valid integer
Step 2 → Call injury service getPlayerRisk(playerId)
Step 3 → Service checks InjuryRiskScores table
         Is there a score where isLatest is true
         and computedAt is within last 6 hours?
Step 4a → If fresh score exists
          Return it immediately
Step 4b → If stale or recalculate requested
          Fetch player game logs from PlayerGameLogs table
          Last 21 days of logs
          Send to Python ML service
          Receive risk score back
          Save new score to InjuryRiskScores table
          Set isLatest true on new, false on old
          Return new score
Step 5 → Format response and send
```

**Response shape:**
```
data → PlayerRiskProfile object
├── All risk fields
├── Player info (name, team, position)
├── Game log summary
│   ├── gamesLast7Days
│   ├── gamesLast21Days
│   └── avgMinutesLast21Days
└── Historical risk scores array
    Last 10 computed scores for trend chart
```

**Error cases:**
```
Player not found      → 404 with clear message
No game logs found    → 200 with null risk and explanation
ML service down       → 200 with last known score from DB
                        plus warning that score may be stale
Invalid playerId      → 400 with validation error
```

---

### Route — GET /api/injury/team/:teamId

**Purpose:**
```
Returns risk summary for entire team roster
The team dashboard view in Module 1
Athletic trainer's main screen
```

**Path parameters:**
```
teamId → integer
```

**Controller flow:**
```
Step 1 → Validate teamId
Step 2 → Call injury service getTeamRisk(teamId)
Step 3 → Service fetches all active players on team
Step 4 → For each player fetch latest risk score
         Use batch DB query not individual queries
         One query gets all scores for all players
Step 5 → Sort players by risk score descending
         Red zone players first
Step 6 → Build team summary counts
Step 7 → Return full team risk object
```

**Response shape:**
```
data → TeamRiskSummary
├── teamId
├── teamName
├── sport
├── summary
│   ├── redCount    → players in red zone
│   ├── yellowCount → players in yellow zone
│   └── greenCount  → players in green zone
├── players → array sorted by risk score
│   Each player
│   ├── Full PlayerRiskProfile
│   └── Position for roster display
└── lastUpdated
```

---

### Route — GET /api/injury/alerts/:sport

**Purpose:**
```
Returns all players currently in red zone
Across entire league for a sport
Morning check view for medical staff
```

**Path parameters:**
```
sport → "NBA" / "NFL" / "MLB" / "NHL"
```

**Query parameters:**
```
zone     → "red" / "yellow" filter, default "red"
limit    → max players to return, default 20
```

**Controller flow:**
```
Step 1 → Validate sport
Step 2 → Call injury service getLeagueAlerts(sport, zone)
Step 3 → Query InjuryRiskScores where
         zone matches requested zone
         isLatest is true
         Join with Players and Teams table
Step 4 → Sort by riskScore descending
Step 5 → Return list with team context
```

**Response shape:**
```
data
├── sport
├── zone requested
├── alerts array
│   Each alert
│   ├── playerId
│   ├── playerName
│   ├── teamName
│   ├── position
│   ├── riskScore
│   ├── zone
│   ├── triggerMetric
│   └── explanation
├── totalAlerts
└── generatedAt
```

---

### Route — GET /api/injury/player/:playerId/history

**Purpose:**
```
Returns risk score history for trend chart
Shows how player's risk has changed over season
```

**Query parameters:**
```
days → how many days of history, default 60
```

**Controller flow:**
```
Query InjuryRiskScores for this player
Order by computedAt ascending
Return array of score snapshots
```

**Response shape:**
```
data
├── playerId
├── playerName
└── history array
    Each entry
    ├── computedAt
    ├── riskScore
    ├── zone
    └── triggerMetric
```

---

## Step 6 — Decision Routes and Controller

**File:** src/routes/decisions.routes.ts
**File:** src/controllers/decisions.controller.ts

---

### Route — GET /api/decisions/coaches/:sport

**Purpose:**
```
Returns full coach leaderboard
The main view for Module 2
Ranked by EV rate best to worst
```

**Path parameters:**
```
sport → sport string
```

**Query parameters:**
```
season       → "2024-25" default current season
decisionType → "4th_down" / "timeout" / "2pt" / "all"
               default "all"
gameType     → "regular" / "playoff" / "all"
               default "all"
page         → pagination default 1
limit        → default 30
```

**Controller flow:**
```
Step 1 → Validate sport and query params
Step 2 → Call decisions service getCoachLeaderboard()
Step 3 → Service checks cache for this query
         Cache key = sport + season + decisionType + gameType
Step 4a → Cache hit → return immediately
Step 4b → Cache miss
          Query DecisionEVScores table
          Join with Coaches and Teams
          Apply filters from query params
          Sort by evRate descending
          Add rank numbers
          Store in cache for 24 hours
Step 5 → Return paginated leaderboard
```

**Response shape:**
```
data → CoachLeaderboard
├── sport
├── season
├── decisionType
├── gameType
├── coaches array
│   Each coach
│   ├── rank
│   ├── coachId
│   ├── coachName
│   ├── teamName
│   ├── totalDecisions
│   ├── optimalDecisions
│   ├── evRate          → shown as percentage
│   ├── avgEvDifference
│   └── trend           → up/down/same vs last month
└── meta (pagination)
```

---

### Route — GET /api/decisions/coach/:coachId

**Purpose:**
```
Returns all decisions for one coach
The drill down view when clicking a coach
```

**Path parameters:**
```
coachId → integer
```

**Query parameters:**
```
season       → season filter
decisionType → filter by type
isOptimal    → true/false filter
page         → pagination
limit        → default 20
```

**Controller flow:**
```
Step 1 → Validate coachId
Step 2 → Call decisions service getCoachDecisions()
Step 3 → Query CoachDecisions table
         Join with Games for date and opponent
         Apply filters
         Sort by gameDate descending most recent first
Step 4 → Build process vs outcome comparison data
         Count optimal decisions where outcome succeeded
         Count optimal decisions where outcome failed
         Count suboptimal where outcome succeeded
         Count suboptimal where outcome failed
         This builds the process vs outcome chart data
Step 5 → Return decisions with comparison summary
```

**Response shape:**
```
data
├── coach
│   ├── coachId
│   ├── coachName
│   ├── teamName
│   └── sport
├── summary
│   ├── totalDecisions
│   ├── optimalDecisions
│   ├── evRate
│   └── rank
├── processVsOutcome
│   ├── goodProcessGoodOutcome   → count
│   ├── goodProcessBadOutcome    → count
│   ├── badProcessGoodOutcome    → count
│   └── badProcessBadOutcome     → count
├── decisions array
│   Each decision
│   ├── Full DecisionDetail object
│   ├── gameDateFormatted
│   └── opponentName
└── meta (pagination)
```

---

### Route — GET /api/decisions/game/:gameId

**Purpose:**
```
Returns all coaching decisions made in one game
Used for game specific analysis
```

**Path parameters:**
```
gameId → integer
```

**Controller flow:**
```
Step 1 → Validate gameId
Step 2 → Query CoachDecisions where gameId matches
         Join with Coaches for coach name
Step 3 → Sort by gameTimeSeconds ascending
         Chronological order through the game
Step 4 → Return all decisions for both coaches
```

**Response shape:**
```
data
├── game
│   ├── gameId
│   ├── date
│   ├── homeTeam
│   ├── awayTeam
│   └── finalScore
├── homeCoachDecisions  → array of DecisionDetail
├── awayCoachDecisions  → array of DecisionDetail
└── gameSummary
    ├── totalDecisions
    ├── optimalDecisions
    └── biggestMistake  → decision with highest evDifference
```

---

### Route — GET /api/decisions/types/:sport

**Purpose:**
```
Returns available decision types for a sport
Used to populate filter dropdowns in frontend
```

**Controller flow:**
```
Read from Sports table config JSON
Return decision types array for that sport
```

---

## Step 7 — Momentum Routes and Controller

**File:** src/routes/momentum.routes.ts
**File:** src/controllers/momentum.controller.ts

---

### Route — GET /api/momentum/analysis/:sport

**Purpose:**
```
Returns the Cox model statistical findings
The main statistical view of Module 3
```

**Path parameters:**
```
sport → sport string
```

**Query parameters:**
```
season → default current season
```

**Controller flow:**
```
Step 1 → Validate sport and season
Step 2 → Call momentum service getMomentumAnalysis()
Step 3 → Check MomentumAnalysis table
         Look for record where sport and season match
         and computedAt is within last 24 hours
Step 4a → Fresh record exists → return it
Step 4b → Stale or missing
          Fetch play by play from PlayByPlay table
          Send to Python ML service
          Receive Cox model results
          Save to MomentumAnalysis table
          Return results
Step 5 → Format and return
```

**Response shape:**
```
data → MomentumResult
├── sport
├── season
├── verdict
│   ├── verdictLabel
│   ├── isSignificant
│   └── shortExplanation
├── statistics
│   ├── hazardCoefficient
│   ├── pValue
│   ├── confidenceIntervalLow
│   ├── confidenceIntervalHigh
│   └── effectSize
├── context
│   ├── gamesAnalyzed
│   ├── playsAnalyzed
│   └── streakThreshold
├── plainExplanation     → full readable paragraph
└── computedAt
```

---

### Route — GET /api/momentum/game/:gameId

**Purpose:**
```
Returns full momentum timeline for one game
Powers the game replay scrubber in Module 3
```

**Path parameters:**
```
gameId → integer
```

**Controller flow:**
```
Step 1 → Validate gameId
Step 2 → Check MomentumGameData table for this gameId
Step 3a → Record exists → return timeline
Step 3b → Not computed yet
          Fetch play by play for this game
          Send to Python compute-game endpoint
          Save result to MomentumGameData table
          Return result
Step 4 → Return timeline with game context
```

**Response shape:**
```
data
├── game
│   ├── gameId
│   ├── date
│   ├── homeTeam
│   ├── awayTeam
│   └── finalScore
├── timeline
│   ├── homeTeamMomentum   → array of {time, score} objects
│   ├── awayTeamMomentum   → array of {time, score} objects
│   └── events             → array of scoring events with momentum
├── summary
│   ├── peakHomeMomentum
│   ├── peakAwayMomentum
│   ├── momentumShifts
│   └── longestStreak
│       ├── length
│       ├── teamName
│       └── startTime
└── computedAt
```

---

### Route — GET /api/momentum/comparison

**Purpose:**
```
Returns momentum analysis for all sports side by side
The sport comparison panel in Module 3
```

**Query parameters:**
```
season → default current season
```

**Controller flow:**
```
Step 1 → For each active sport
         Fetch MomentumAnalysis record
         If any are missing trigger background compute
Step 2 → Combine all into comparison array
Step 3 → Sort by effectSize descending
         Strongest momentum sport first
Step 4 → Return comparison object
```

**Response shape:**
```
data → SportComparison
├── season
├── sports array sorted by effect size
│   Each sport
│   ├── sport
│   ├── verdictLabel
│   ├── isSignificant
│   ├── hazardCoefficient
│   ├── pValue
│   ├── effectSize
│   └── shortExplanation
└── generatedAt
```

---

### Route — GET /api/momentum/timeout/:sport

**Purpose:**
```
Returns timeout recommendation for a specific situation
Powers the timeout optimizer tool
```

**Path parameters:**
```
sport → sport string
```

**Query parameters:**
```
consecutiveScores   → integer, how many in a row opponent scored
scoreDiff           → integer, current score difference
timeRemaining       → integer, seconds remaining
period              → integer, current period
timeoutsAvailable   → integer, how many timeouts left
```

**Controller flow:**
```
Step 1 → Validate all query parameters
Step 2 → Build scenario key from parameters
Step 3 → Look up TimeoutRecommendations table
         Find record matching sport + scenarioKey
Step 4a → Found → return recommendation immediately
Step 4b → Not found (edge case)
          Send to Python for real-time computation
          Store result
          Return recommendation
Step 5 → Return recommendation
```

**Response shape:**
```
data
├── situation
│   ├── consecutiveScores
│   ├── scoreDiff
│   ├── timeRemaining
│   ├── period
│   └── timeoutsAvailable
├── recommendation
│   ├── shouldCallTimeout
│   ├── stopProbabilityWith
│   ├── stopProbabilityWithout
│   ├── probabilityDiff
│   ├── confidenceLevel
│   └── recommendationText
└── basedOnSampleSize
```

---

## Step 8 — Search Routes and Controller

**File:** src/routes/search.routes.ts
**File:** src/controllers/search.controller.ts

---

### Route — GET /api/search/players

**Purpose:**
```
Player autocomplete search
Used by search bar in frontend
Fast typeahead results
```

**Query parameters:**
```
q      → search query string, minimum 2 characters
sport  → optional sport filter
limit  → default 10 results max
```

**Controller flow:**
```
Step 1 → Validate q is at least 2 characters
Step 2 → Check in-memory cache for this query
         Cache key = "search_player_" + q + sport
Step 3a → Cache hit → return immediately
Step 3b → Cache miss
          Query Players table
          WHERE firstName LIKE %q% OR lastName LIKE %q%
          Optional sport filter
          Join with Teams for team name
          Limit results
          Store in memory cache for 1 hour
Step 4 → Return results
```

**Response shape:**
```
data
└── players array
    Each result
    ├── playerId
    ├── playerName
    ├── position
    ├── teamName
    ├── teamAbbreviation
    ├── sport
    └── injuryStatus
```

---

### Route — GET /api/search/teams

**Purpose:**
```
Team search and autocomplete
```

**Query parameters:**
```
q      → search string
sport  → optional filter
```

**Controller flow:**
```
Similar to player search
Query Teams table with LIKE on name and city
Return matching teams with sport info
```

---

### Route — GET /api/search/coaches

**Purpose:**
```
Coach search for decision module
```

**Query parameters:**
```
q      → search string
sport  → optional filter
```

---

### Route — GET /api/search/games

**Purpose:**
```
Search games by team or date
For game replay and decision drill down
```

**Query parameters:**
```
teamId    → filter by team
sport     → filter by sport
season    → filter by season
dateFrom  → start date
dateTo    → end date
page      → pagination
limit     → default 20
```

---

## Step 9 — Story Routes and Controller

**File:** src/routes/story.routes.ts
**File:** src/controllers/story.controller.ts

---

### Route — GET /api/story/:module/:sport

**Purpose:**
```
Generates or retrieves story mode text
For the current view the user is looking at
```

**Path parameters:**
```
module → "injury" / "decisions" / "momentum"
sport  → sport string
```

**Query parameters:**
```
role       → user role for tone adaptation
entityId   → player ID or coach ID the story is about
season     → season context
```

**Controller flow:**
```
Step 1 → Validate module and sport
Step 2 → Build storyKey from all parameters
Step 3 → Check StoryLogs table for valid cached story
         Valid = expiresAt is in the future
Step 4a → Found valid story → return immediately
Step 4b → Not found or expired
          Fetch relevant data from DB
          For injury → get player risk profile
          For decisions → get coach scorecard
          For momentum → get momentum analysis
          Build metrics object from fetched data
          Call Python story endpoint
          Receive story text
          Save to StoryLogs with 1 hour expiry
          Return story
Step 5 → Return story
```

**Response shape:**
```
data
├── module
├── sport
├── role
├── entityName
├── storyText       → full paragraph
├── headlineText    → one line summary
├── toneLabel       → warning / positive / neutral
├── generatedBy     → template or openai
└── generatedAt
```

---

## Step 10 — ML Client Layer

**File:** src/ml/ml.client.ts

**What this does:**
```
All HTTP communication from Node to Python
Centralized in one file
Every other file imports from here
```

**Configuration:**
```
Base URL    → PYTHON_ML_URL from environment
Timeout     → 30 seconds (models can take time)
Retry       → 2 retries on failure
Headers     → Content-Type application/json
```

**Health check function:**
```
checkMLHealth()
├── GET request to Python /health
├── Returns true if 200 received
└── Returns false if any error
Used by Node health check endpoint
```

---

**File:** src/ml/injury.ml.ts

**Functions:**
```
computePlayerRisk(gameLogs, playerInfo)
├── POST to Python /injury/compute-risk
├── Sends formatted game logs
├── Returns PlayerRiskScore object
└── Throws if ML service unavailable

computeTeamRisk(allPlayerLogs)
├── POST to Python /injury/compute-team-risk
├── Batch computation for whole team
└── Returns array of risk scores
```

---

**File:** src/ml/decisions.ml.ts

**Functions:**
```
computeDecisionEV(gameContext, decisionType, sport)
├── POST to Python /decisions/compute-ev
├── Returns EV for all options
└── Returns isOptimal determination

computeCoachScorecard(coachId, decisions)
├── POST to Python /decisions/compute-scorecard
└── Returns aggregated EV rate
```

---

**File:** src/ml/momentum.ml.ts

**Functions:**
```
computeSeasonMomentum(plays, sport, season)
├── POST to Python /momentum/compute-season
└── Returns full Cox model results

computeGameMomentum(plays, gameId)
├── POST to Python /momentum/compute-game
└── Returns momentum timeline

precomputeTimeouts(sport)
├── POST to Python /timeout/precompute
└── Returns 2250 scenario recommendations
    Node writes these to DB
```

---

**File:** src/ml/story.ml.ts

**Functions:**
```
generateStory(module, sport, role, entityName, metrics)
├── POST to Python /story/generate
└── Returns story text and headline
```

---

**Error handling in all ML client functions:**
```
Try the Python call
If Python returns error status
└── Throw custom MLServiceError

If Python is unreachable (connection refused)
└── Throw custom MLServiceUnavailableError

Callers (services) catch these specifically
└── MLServiceUnavailableError → use cached DB data
└── MLServiceError → return error to controller
```

---

## Step 11 — Service Layer

**Each module has a service file**
**Services sit between controllers and data sources**

---

**File:** src/services/injury.service.ts

**Functions:**

```
getPlayerRisk(playerId, forceRecalculate)
├── Fetch player from DB
├── Check for fresh risk score in DB
├── If stale → fetch game logs from DB
│             → call injury.ml.ts
│             → save new score to DB
│             → return new score
└── If fresh → return DB score

getTeamRisk(teamId)
├── Fetch all active players on team
├── Batch fetch their latest risk scores
└── Build and return TeamRiskSummary

getLeagueAlerts(sport, zone)
├── Query InjuryRiskScores by zone and sport
├── Join player and team data
└── Return sorted alert list

getPlayerRiskHistory(playerId, days)
├── Query InjuryRiskScores for player
├── Filter by date range
└── Return sorted by date
```

---

**File:** src/services/decisions.service.ts

**Functions:**

```
getCoachLeaderboard(sport, season, decisionType, gameType)
├── Check cache for this exact query
├── If miss → query DecisionEVScores
│             join Coaches and Teams
│             apply filters and sort
│             cache result
└── Return ranked leaderboard

getCoachDecisions(coachId, filters)
├── Query CoachDecisions with filters
├── Join Games for context
├── Build processVsOutcome matrix
└── Return paginated decisions

getGameDecisions(gameId)
├── Query CoachDecisions for game
├── Split by home and away coach
└── Return both coaches decisions

refreshCoachScorecard(coachId, season)
├── Fetch all decisions for coach and season
├── Call decisions.ml.ts
├── Update DecisionEVScores table
└── Invalidate leaderboard cache
```

---

**File:** src/services/momentum.service.ts

**Functions:**

```
getMomentumAnalysis(sport, season)
├── Check MomentumAnalysis table
├── If stale → fetch plays from DB
│             → call momentum.ml.ts
│             → save result to DB
└── Return analysis

getGameMomentum(gameId)
├── Check MomentumGameData table
├── If missing → fetch game plays from DB
│               → call compute-game
│               → save result
└── Return timeline

getSportComparison(season)
├── Fetch analysis for all active sports
├── Combine into comparison object
└── Sort by effect size

getTimeoutRecommendation(sport, situation)
├── Build scenario key
├── Look up TimeoutRecommendations
└── Return recommendation

initializeTimeoutRecommendations(sport)
├── Call precomputeTimeouts from ML client
├── Bulk write all scenarios to DB
└── Log completion
```

---

**File:** src/services/cache.service.ts

**Functions:**

```
get(key)
├── Check node-cache first (memory)
├── If miss → check CacheMetadata in DB
│             If valid → return from DB
└── Return null if nothing found

set(key, value, ttl)
├── Store in node-cache with TTL
├── Update CacheMetadata record
└── Log cache write

invalidate(key)
├── Remove from node-cache
├── Set isValid false in CacheMetadata
└── Log invalidation

invalidateByDataType(dataType, sportId)
├── Find all CacheMetadata matching type and sport
├── Invalidate all of them
└── Remove from node-cache

getStats()
└── Return cache hit rate and size metrics
```

---

## Step 12 — Test All Routes

**Testing approach:**
```
Use a tool like Postman or Thunder Client
Test every endpoint manually
Verify request and response shapes
Verify error cases handled properly
```

---

**Test set — Injury routes:**
```
□ GET /api/injury/player/1
  → Returns risk profile with all fields
  → riskScore between 0 and 100
  → zone is green yellow or red
  → explanation is readable text

□ GET /api/injury/player/1?recalculate=true
  → Forces fresh ML computation
  → Returns updated score
  → New record in InjuryRiskScores

□ GET /api/injury/player/99999
  → Returns 404 not found

□ GET /api/injury/team/1
  → Returns all players on team
  → Sorted by risk score descending
  → Summary counts correct

□ GET /api/injury/alerts/NBA
  → Returns red zone players
  → All from NBA teams
  → Sorted by risk score

□ GET /api/injury/alerts/NBA?zone=yellow
  → Returns yellow zone players only
```

---

**Test set — Decision routes:**
```
□ GET /api/decisions/coaches/NFL
  → Returns leaderboard
  → Sorted by evRate descending
  → All coaches have rank numbers

□ GET /api/decisions/coaches/NFL?decisionType=4th_down
  → Filtered to only 4th down decisions
  → evRate reflects only those decisions

□ GET /api/decisions/coach/1
  → Returns all decisions for coach
  → processVsOutcome matrix populated
  → Sorted most recent first

□ GET /api/decisions/coach/1?isOptimal=false
  → Only shows bad decisions
  → All have isOptimal as false

□ GET /api/decisions/game/1
  → Both coaches decisions returned
  → Sorted chronologically
  → biggestMistake identified
```

---

**Test set — Momentum routes:**
```
□ GET /api/momentum/analysis/NBA
  → Returns Cox model results
  → All statistical fields present
  → Plain explanation readable

□ GET /api/momentum/game/1
  → Returns full timeline
  → homeTeamMomentum is array
  → Events array has entries

□ GET /api/momentum/comparison
  → All 4 sports returned
  → Sorted by effectSize
  → Each has verdictLabel

□ GET /api/momentum/timeout/NFL?consecutiveScores=3&scoreDiff=-3&timeRemaining=180&period=4&timeoutsAvailable=2
  → Returns recommendation
  → shouldCallTimeout is boolean
  → probabilities make sense
```

---

**Test set — Search routes:**
```
□ GET /api/search/players?q=leb
  → Returns LeBron and similar
  → Fast response under 100ms

□ GET /api/search/players?q=l
  → Returns 400 query too short

□ GET /api/search/players?q=james&sport=NBA
  → Filtered to NBA only

□ GET /api/search/teams?q=lak
  → Returns Lakers
```

---

**Test set — Story routes:**
```
□ GET /api/story/injury/NBA?role=trainer&entityId=1
  → Returns readable paragraph
  → Tone appropriate for trainer

□ GET /api/story/injury/NBA?role=fan&entityId=1
  → Simpler language than trainer

□ GET /api/story/decisions/NFL?role=coach&entityId=1
  → Coach focused narrative

□ GET /api/story/momentum/NBA?role=analyst
  → Statistical language appropriate
```

---

**Test set — Error handling:**
```
□ Invalid sport parameter
  → 400 with clear error message

□ ML service down
  → Returns cached data with warning
  → Does not return 500

□ Missing required query param
  → 400 with which param is missing

□ Database error
  → 500 with safe message
  → Full error logged internally
  → Stack trace not exposed
```

---

## Phase 5 Complete File List

```
src/
├── routes/
│   ├── shared.routes.ts        ← new
│   ├── injury.routes.ts        ← new
│   ├── decisions.routes.ts     ← new
│   ├── momentum.routes.ts      ← new
│   ├── search.routes.ts        ← new
│   └── story.routes.ts         ← new
│
├── controllers/
│   ├── shared.controller.ts    ← new
│   ├── injury.controller.ts    ← new
│   ├── decisions.controller.ts ← new
│   ├── momentum.controller.ts  ← new
│   ├── search.controller.ts    ← new
│   └── story.controller.ts     ← new
│
├── services/
│   ├── injury.service.ts       ← new
│   ├── decisions.service.ts    ← new
│   ├── momentum.service.ts     ← new
│   ├── cache.service.ts        ← new
│   └── story.service.ts        ← new
│
└── ml/
    ├── ml.client.ts            ← new
    ├── injury.ml.ts            ← new
    ├── decisions.ml.ts         ← new
    ├── momentum.ml.ts          ← new
    └── story.ml.ts             ← new
```

---

## Phase 5 Summary

| Step | What It Builds | Key Output |
|---|---|---|
| Step 1 | Architecture understanding | Request flow clear |
| Step 2 | TypeScript types | All interfaces defined |
| Step 3 | Route registration | All routes connected to app |
| Step 4 | Shared routes | Sports and teams endpoints |
| Step 5 | Injury routes | 4 injury endpoints working |
| Step 6 | Decision routes | 4 decision endpoints working |
| Step 7 | Momentum routes | 4 momentum endpoints working |
| Step 8 | Search routes | 4 search endpoints working |
| Step 9 | Story routes | Story generation endpoint |
| Step 10 | ML client layer | Node to Python communication |
| Step 11 | Service layer | Business logic complete |
| Step 12 | Testing | All endpoints verified |

---

## What Phase 5 Delivers

```
After Phase 5 is complete

Every frontend feature has a working endpoint
├── Injury risk for any player
├── Team risk dashboard
├── League wide alerts
├── Coach leaderboard
├── Coach decision drill down
├── Game decision view
├── Momentum statistical analysis
├── Game replay timeline
├── Sport comparison
├── Timeout optimizer
├── Player and team search
└── Story mode text

The backend is now fully functional
Frontend can be built entirely from these endpoints
Phase 6 adds background jobs to keep data fresh
Phase 7 adds caching to make it fast
```

**Phase 5 is where the backend becomes a complete product**
**Every feature the judges will see has an endpoint behind it**
**Clean layered architecture means each piece is testable and changeable**