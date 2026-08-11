# AQX Sports Intelligence — Complete Database Schema 

---

## Database Overview

```
Database Engine → SQLite
ORM → Prisma
Total Tables → 15
Relationships → Full relational structure
Data Types → Properly typed per field
```

---

## Table Relationships Map

```
Sports
├── Teams (one sport has many teams)
│ ├── Players (one team has many players)
│ │ └── PlayerGameLogs (one player has many game logs)
│ │ └── linked to Games
│ └── Coaches (one team has one active coach)
│ └── CoachDecisions (one coach has many decisions)
│
├── Games (one sport has many games)
│ ├── PlayByPlay (one game has many plays)
│ ├── CoachDecisions (one game has many decisions)
│ └── MomentumGameData (one game has one momentum timeline)
│
InjuryRiskScores → linked to Players
DecisionEVScores → linked to Coaches
MomentumAnalysis → linked to Sports (season level)
CacheMetadata → standalone tracking table
StoryLogs → standalone cache table
```

---

## Every Table — Full Detail

---

### Table 1 — Sports

**Purpose:** Master reference table for all supported sports

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| name | String | Yes | Full name — "NBA", "NFL", "MLB", "NHL" |
| abbreviation | String | Yes | Short code — "nba", "nfl" |
| isActive | Boolean | Yes | Whether this sport is enabled in app |
| season | String | Yes | Current active season — "2024-25" |
| config | JSON | Yes | Sport specific settings stored as JSON |
| createdAt | DateTime | Yes | Auto set on creation |
| updatedAt | DateTime | Yes | Auto updates on change |

**Config JSON contains:**
```
decisionTypes → list of decision categories for that sport
dataSource → which API fetcher to use
momentumMetric → what counts as a scoring event
workloadMetrics → which workload fields to track
```

**Unique constraints:**
```
name must be unique
abbreviation must be unique
```

---

### Table 2 — Teams

**Purpose:** All teams across all sports

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| sportId | Integer | Yes | Foreign key to Sports table |
| name | String | Yes | Full team name — "Los Angeles Lakers" |
| abbreviation | String | Yes | Short code — "LAL" |
| city | String | Yes | City name — "Los Angeles" |
| conference | String | No | "Eastern" / "Western" / "NFC" / "AFC" |
| division | String | No | Division name |
| externalId | String | Yes | ID used by the sports API for this team |
| logoUrl | String | No | URL to team logo image |
| isActive | Boolean | Yes | Is team currently active in league |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates |

**Relationships:**
```
Belongs to → Sports (via sportId)
Has many → Players
Has many → Games (as home team)
Has many → Games (as away team)
Has one → Coach (active coach)
```

**Unique constraints:**
```
externalId + sportId must be unique together
abbreviation + sportId must be unique together
```

---

### Table 3 — Players

**Purpose:** All players across all sports

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| teamId | Integer | Yes | Foreign key to Teams table |
| sportId | Integer | Yes | Foreign key to Sports table |
| name | String | Yes | Full player name |
| firstName | String | Yes | First name for search |
| lastName | String | Yes | Last name for search |
| position | String | Yes | Position abbreviation — "PG", "QB", "SP" |
| jerseyNumber | String | No | Jersey number |
| age | Integer | No | Current age |
| heightInches | Integer | No | Height in inches |
| weightLbs | Integer | No | Weight in pounds |
| externalId | String | Yes | ID from sports API |
| isActive | Boolean | Yes | Currently on active roster |
| injuryStatus | String | No | "healthy" / "questionable" / "out" |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates |

**Relationships:**
```
Belongs to → Teams (via teamId)
Belongs to → Sports (via sportId)
Has many → PlayerGameLogs
Has many → InjuryRiskScores
```

**Unique constraints:**
```
externalId + sportId must be unique together
```

**Indexes:**
```
Index on lastName for fast search
Index on teamId for team roster queries
Index on sportId for sport wide queries
```

---

### Table 4 — Coaches

**Purpose:** All coaches across all sports

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| teamId | Integer | Yes | Foreign key to Teams |
| sportId | Integer | Yes | Foreign key to Sports |
| name | String | Yes | Full coach name |
| firstName | String | Yes | First name |
| lastName | String | Yes | Last name |
| role | String | Yes | "head_coach" / "offensive_coordinator" |
| externalId | String | Yes | ID from sports API |
| isActive | Boolean | Yes | Currently coaching this team |
| hireDate | DateTime | No | When they joined this team |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates |

**Relationships:**
```
Belongs to → Teams (via teamId)
Belongs to → Sports (via sportId)
Has many → CoachDecisions
Has many → DecisionEVScores
```

---

### Table 5 — Games

**Purpose:** All game records across all sports

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| sportId | Integer | Yes | Foreign key to Sports |
| homeTeamId | Integer | Yes | Foreign key to Teams |
| awayTeamId | Integer | Yes | Foreign key to Teams |
| homeCoachId | Integer | No | Foreign key to Coaches |
| awayCoachId | Integer | No | Foreign key to Coaches |
| date | DateTime | Yes | Game date and time |
| season | String | Yes | Season identifier — "2024-25" |
| gameType | String | Yes | "regular" / "playoff" / "preseason" |
| week | Integer | No | NFL week number |
| homeScore | Integer | No | Final home team score |
| awayScore | Integer | No | Final away team score |
| winner | String | No | "home" / "away" / "tie" |
| status | String | Yes | "scheduled" / "live" / "final" |
| externalId | String | Yes | ID from sports API |
| venue | String | No | Stadium or arena name |
| attendance | Integer | No | Game attendance number |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates |

**Relationships:**
```
Belongs to → Sports
Belongs to → Teams (home)
Belongs to → Teams (away)
Has many → PlayByPlay
Has many → PlayerGameLogs
Has many → CoachDecisions
Has one → MomentumGameData
```

**Unique constraints:**
```
externalId + sportId unique together
```

**Indexes:**
```
Index on date for date range queries
Index on homeTeamId and awayTeamId
Index on season for season filtering
```

---

### Table 6 — PlayerGameLogs

**Purpose:** Every player's stats and workload for every game they played

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| playerId | Integer | Yes | Foreign key to Players |
| gameId | Integer | Yes | Foreign key to Games |
| teamId | Integer | Yes | Foreign key to Teams |
| date | DateTime | Yes | Game date |
| minutesPlayed | Float | No | Total minutes on court/field |
| distanceCovered | Float | No | Miles or km covered if available |
| highIntensityEvents | Integer | No | Sprints, jumps, hard cuts counted |
| backToBack | Boolean | Yes | Was this a back to back game |
| daysRestBefore | Integer | No | Days since last game |
| gamesLast7Days | Integer | No | How many games in last 7 days |
| gamesLast14Days | Integer | No | How many games in last 14 days |
| gamesLast21Days | Integer | No | How many games in last 21 days |
| points | Integer | No | Points scored |
| assists | Integer | No | Assists |
| rebounds | Integer | No | Rebounds |
| rawBoxScore | JSON | Yes | Full box score stored as JSON |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates |

**Relationships:**
```
Belongs to → Players
Belongs to → Games
Belongs to → Teams
```

**Unique constraints:**
```
playerId + gameId must be unique (one log per player per game)
```

**Indexes:**
```
Index on playerId + date for baseline calculations
Index on date for recent window queries
```

---

### Table 7 — InjuryRiskScores

**Purpose:** Stores computed injury risk results for every player

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| playerId | Integer | Yes | Foreign key to Players |
| computedAt | DateTime | Yes | When this score was calculated |
| windowStart | DateTime | Yes | Start of the 7 day analysis window |
| windowEnd | DateTime | Yes | End of the 7 day analysis window |
| riskScore | Float | Yes | 0 to 100 composite score |
| zone | String | Yes | "green" / "yellow" / "red" |
| minutesZScore | Float | No | Z-score for minutes metric |
| distanceZScore | Float | No | Z-score for distance metric |
| intensityZScore | Float | No | Z-score for intensity metric |
| backToBackFlag | Boolean | Yes | Back to back flagged |
| triggerMetric | String | No | Which metric caused the flag |
| baselineMeanMinutes | Float | No | Player's personal 21 day mean |
| baselineStdMinutes | Float | No | Player's personal 21 day std dev |
| explanation | String | Yes | Plain English explanation |
| isLatest | Boolean | Yes | Is this the most recent score |
| createdAt | DateTime | Yes | Auto set |

**Relationships:**
```
Belongs to → Players
```

**Indexes:**
```
Index on playerId + isLatest for fast current score lookup
Index on zone for alert queries
Index on computedAt for time series
```

---

### Table 8 — PlayByPlay

**Purpose:** Every single play or event in every game

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| gameId | Integer | Yes | Foreign key to Games |
| sportId | Integer | Yes | Foreign key to Sports |
| eventNumber | Integer | Yes | Sequential event number in game |
| period | Integer | Yes | Quarter, period, inning number |
| clock | String | No | Time remaining in period |
| eventTimeSeconds | Float | No | Seconds elapsed in game |
| teamId | Integer | No | Team that generated this event |
| playerId | Integer | No | Player involved |
| eventType | String | Yes | "score" / "turnover" / "foul" / "timeout" etc |
| eventSubtype | String | No | More specific event classification |
| description | String | Yes | Text description of the play |
| homeScore | Integer | Yes | Home score at this moment |
| awayScore | Integer | Yes | Away score at this moment |
| scoreDiff | Integer | Yes | Score differential at this moment |
| isScoring | Boolean | Yes | Did this event change the score |
| homeWinProbability | Float | No | Win probability for home team at this moment |
| rawEvent | JSON | Yes | Full raw event data from API |
| createdAt | DateTime | Yes | Auto set |

**Relationships:**
```
Belongs to → Games
Belongs to → Sports
Belongs to → Teams (optional)
Belongs to → Players (optional)
```

**Indexes:**
```
Index on gameId for game replay queries
Index on gameId + isScoring for momentum calculations
Index on eventType for decision extraction
```

---

### Table 9 — CoachDecisions

**Purpose:** Every extracted coaching decision with full context

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| gameId | Integer | Yes | Foreign key to Games |
| coachId | Integer | Yes | Foreign key to Coaches |
| sportId | Integer | Yes | Foreign key to Sports |
| decisionType | String | Yes | "4th_down" / "timeout" / "2pt_conversion" / "intentional_walk" |
| period | Integer | Yes | When in game this happened |
| clock | String | No | Time remaining when decision made |
| gameTimeSeconds | Float | No | Seconds elapsed at decision point |
| scoreDiff | Integer | Yes | Score difference at decision point |
| winProbabilityBefore | Float | No | Win probability before decision |
| gameContext | JSON | Yes | Full situation stored as JSON |
| chosenAction | String | Yes | What the coach actually did |
| evChosen | Float | No | Expected value of chosen action |
| evBest | Float | No | Expected value of best available action |
| evDifference | Float | No | How much EV was left on the table |
| isOptimal | Boolean | Yes | Was this the highest EV choice |
| alternativeActions | JSON | Yes | All options and their EVs |
| outcome | String | No | What actually happened after |
| outcomeSuccess | Boolean | No | Did the play work out |
| createdAt | DateTime | Yes | Auto set |

**Relationships:**
```
Belongs to → Games
Belongs to → Coaches
Belongs to → Sports
```

**Indexes:**
```
Index on coachId for coach scorecard queries
Index on sportId + decisionType for filtered analysis
Index on isOptimal for leaderboard calculations
```

---

### Table 10 — DecisionEVScores

**Purpose:** Aggregated season level scorecard per coach

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| coachId | Integer | Yes | Foreign key to Coaches |
| sportId | Integer | Yes | Foreign key to Sports |
| season | String | Yes | Season identifier |
| gameType | String | Yes | "regular" / "playoff" / "all" |
| decisionType | String | Yes | Which category of decision |
| totalDecisions | Integer | Yes | Total decisions made |
| optimalDecisions | Integer | Yes | How many were optimal |
| evRate | Float | Yes | Percentage of optimal decisions |
| avgEvDifference | Float | No | Average EV left on table per decision |
| totalEvLeft | Float | No | Total EV left on table all season |
| rank | Integer | No | Rank among all coaches in sport |
| computedAt | DateTime | Yes | When this was calculated |
| createdAt | DateTime | Yes | Auto set |

**Relationships:**
```
Belongs to → Coaches
Belongs to → Sports
```

**Unique constraints:**
```
coachId + season + decisionType + gameType unique together
```

---

### Table 11 — MomentumAnalysis

**Purpose:** Season level statistical momentum findings per sport

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| sportId | Integer | Yes | Foreign key to Sports |
| season | String | Yes | Season analyzed |
| gamesAnalyzed | Integer | Yes | How many games used in model |
| hazardCoefficient | Float | Yes | Cox model main output |
| pValue | Float | Yes | Statistical significance |
| confidenceIntervalLow | Float | Yes | Lower CI bound |
| confidenceIntervalHigh | Float | Yes | Upper CI bound |
| isSignificant | Boolean | Yes | p-value below 0.05 |
| effectSize | Float | No | Practical size of the effect |
| streakThreshold | Integer | No | How many consecutive scores trigger momentum |
| hazardRateChange | Float | No | Percentage change in opponent hazard rate |
| plainExplanation | String | Yes | Full plain English summary |
| shortExplanation | String | Yes | One sentence summary |
| computedAt | DateTime | Yes | When model was run |
| createdAt | DateTime | Yes | Auto set |

**Relationships:**
```
Belongs to → Sports
```

**Unique constraints:**
```
sportId + season unique together
```

---

### Table 12 — MomentumGameData

**Purpose:** Per game momentum score timeline for replay feature

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| gameId | Integer | Yes | Foreign key to Games |
| homeTeamMomentum | JSON | Yes | Array of momentum scores for home team over time |
| awayTeamMomentum | JSON | Yes | Array of momentum scores for away team over time |
| timelineEvents | JSON | Yes | Full event by event momentum data |
| peakHomeMomentum | Float | No | Highest home momentum in game |
| peakAwayMomentum | Float | No | Highest away momentum in game |
| momentumShifts | Integer | No | How many times momentum changed hands |
| computedAt | DateTime | Yes | When this was calculated |
| createdAt | DateTime | Yes | Auto set |

**Relationships:**
```
Belongs to → Games (one to one)
```

**Unique constraints:**
```
gameId must be unique (one timeline per game)
```

---

### Table 13 — TimeoutRecommendations

**Purpose:** Stores pre-computed timeout optimizer results

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| sportId | Integer | Yes | Foreign key to Sports |
| scenarioKey | String | Yes | Hash of the game situation parameters |
| consecutiveScores | Integer | Yes | Opponent consecutive scoring events |
| scoreDiff | Integer | Yes | Current score difference |
| timeRemaining | Float | Yes | Seconds remaining in game |
| period | Integer | Yes | Current period |
| shouldCallTimeout | Boolean | Yes | Recommendation |
| stopProbabilityWith | Float | Yes | Stop probability if timeout called |
| stopProbabilityWithout | Float | Yes | Stop probability if no timeout |
| probabilityDiff | Float | Yes | Difference between the two |
| recommendationText | String | Yes | Plain English advice |
| confidenceLevel | String | Yes | "high" / "medium" / "low" |
| computedAt | DateTime | Yes | When calculated |
| createdAt | DateTime | Yes | Auto set |

**Unique constraints:**
```
sportId + scenarioKey unique together
```

---

### Table 14 — CacheMetadata

**Purpose:** Tracks all cached data so we know what is fresh and what needs refresh

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| cacheKey | String | Yes | Unique identifier for this cache entry |
| dataType | String | Yes | "player_logs" / "risk_scores" / "coach_decisions" etc |
| sportId | Integer | No | Which sport this cache is for |
| entityId | String | No | Player ID or team ID this belongs to |
| season | String | No | Season this data covers |
| cachedAt | DateTime | Yes | When data was last fetched |
| expiresAt | DateTime | Yes | When this cache entry becomes stale |
| recordCount | Integer | No | How many records were cached |
| isValid | Boolean | Yes | Whether cache is still good |
| lastError | String | No | Last fetch error if any |
| fetchDurationMs | Integer | No | How long the fetch took |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates |

**Unique constraints:**
```
cacheKey must be unique
```

---

### Table 15 — StoryLogs

**Purpose:** Caches generated story mode text so we don't regenerate every time

| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| storyKey | String | Yes | Hash of the inputs used to generate |
| module | String | Yes | "injury" / "decisions" / "momentum" |
| sport | String | Yes | Which sport |
| role | String | Yes | Which role mode |
| entityId | String | No | Player or coach the story is about |
| storyText | String | Yes | The full generated paragraph |
| keyMetrics | JSON | Yes | The data points used in generation |
| generatedBy | String | Yes | "template" / "openai" |
| expiresAt | DateTime | Yes | When to regenerate |
| createdAt | DateTime | Yes | Auto set |

**Unique constraints:**
```
storyKey must be unique
```

---

## Full Relationship Summary

```
Sports (1) ──────────── (many) Teams
Sports (1) ──────────── (many) Games
Sports (1) ──────────── (many) Players
Sports (1) ──────────── (many) MomentumAnalysis

Teams (1) ───────────── (many) Players
Teams (1) ───────────── (many) Coaches
Teams (1) ───────────── (many) Games as home
Teams (1) ───────────── (many) Games as away

Players (1) ─────────── (many) PlayerGameLogs
Players (1) ─────────── (many) InjuryRiskScores

Coaches (1) ─────────── (many) CoachDecisions
Coaches (1) ─────────── (many) DecisionEVScores

Games (1) ───────────── (many) PlayByPlay
Games (1) ───────────── (many) PlayerGameLogs
Games (1) ───────────── (many) CoachDecisions
Games (1) ───────────── (one) MomentumGameData
```

---

## Index Strategy Summary

```
High frequency queries get indexes

Player search → lastName, firstName
Team lookup → sportId, abbreviation
Game filtering → date, season, sportId
Risk score lookup → playerId + isLatest
Play by play replay → gameId + eventNumber
Coach leaderboard → sportId + season + evRate
Momentum timeline → gameId
Cache checking → cacheKey, expiresAt
```

---

## Data Volume Estimates

```
Sports → 4 rows
Teams → ~130 rows (all 4 sports)
Players → ~3000 rows (all active rosters)
Coaches → ~200 rows
Games → ~5000 rows per season
PlayerGameLogs → ~80000 rows per season
PlayByPlay → ~500000 rows per season
InjuryRiskScores → ~3000 rows per compute run
CoachDecisions → ~15000 rows per season
DecisionEVScores → ~800 rows per season
MomentumAnalysis → 4 rows per season
MomentumGameData → ~5000 rows per season
TimeoutRecommend → ~1000 pre-computed scenarios
CacheMetadata → ~500 rows
StoryLogs → ~2000 rows rolling
```

**SQLite handles all of this comfortably**
Well within SQLite's sweet spot for a hackathon project

---

## Summary

```
Total Tables → 15
Core data tables → 8 (Sports through PlayByPlay)
Computed result tables → 5 (Injury through Timeout)
System tables → 2 (Cache and Story)
Total relationships → 14 foreign key connections
Unique constraints → 12 business logic constraints
Indexes → 15 performance indexes
```

This schema covers every data need for all three modules completely.
Clean, relational, properly indexed, and ready for Prisma implementation.
