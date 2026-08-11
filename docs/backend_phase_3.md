# Phase 3 — Data Fetching Layer — Step by Step 

---

## Overview of Steps

```
Step 1 → Understand the data sources
Step 2 → Setup the data folder structure
Step 3 → Setup the master fetcher manager
Step 4 → Build NBA data fetcher
Step 5 → Build NFL data fetcher
Step 6 → Build MLB data fetcher
Step 7 → Build the data transformer layer
Step 8 → Build the database writer layer
Step 9 → Build the sync coordinator
Step 10 → Test all fetchers
```

---

## Step 1 — Understand the Data Sources

**What we do:**
```
Before writing any code
understand exactly what APIs we are hitting
what they return
and what we need from them
```

---

### NBA Data Source

**API:** BallDontLie API
```
Base URL → https://api.balldontlie.io/v1
Authentication → Free tier needs API key (free to get)
Rate Limit → 30 requests per minute on free tier
Data Available
├── All teams
├── All players
├── Game results
├── Player stats per game (box scores)
└── Season averages
```

**What we need from it:**
```
Teams endpoint → /teams
Players endpoint → /players
Games endpoint → /games
Player stats endpoint → /stats
```

**Limitations of free tier:**
```
No play by play data
No tracking data (distance, speed)
Box score stats only
We work with what we have for MVP
```

**What fields we actually use:**
```
From teams
├── id, name, abbreviation, city, conference, division

From players
├── id, first_name, last_name, position, team

From games
├── id, date, home_team, visitor_team, home_team_score
└── visitor_team_score, status, season

From stats (box scores)
├── player, game, team
├── min (minutes played)
├── pts, reb, ast
└── All standard box score fields
```

---

### NFL Data Source

**API:** nfl-data-py via Python microservice
```
This is a Python library not a REST API
So Node.js calls our Python microservice
which calls nfl-data-py
and returns the data as JSON

Data Available
├── Play by play (very detailed)
├── Player stats
├── Team stats
├── Schedules
├── Roster data
└── 4th down decisions extractable from play by play
```

**Alternative if Python not ready yet:**
```
ESPN public API (no key needed)
Base URL → https://site.api.espn.com/apis/site/v2/sports/football/nfl
Works directly from Node.js
Good enough for teams and schedules
```

**What fields we actually use:**
```
From play by play
├── game_id, play_id, desc
├── down, ydstogo, yardline_100
├── play_type, yards_gained
├── posteam, defteam
├── score_differential
├── game_seconds_remaining
├── fourth_down_converted
├── fourth_down_failed
├── timeout (boolean)
└── two_point_conv_result
```

---

### MLB Data Source

**API:** MLB Stats API (official, completely free)
```
Base URL → https://statsapi.mlb.com/api/v1
Authentication → None needed
Rate Limit → Very generous, no documented limit
Data Available
├── Teams and rosters
├── Game schedules
├── Box scores
├── Play by play
└── Player stats
```

**What fields we actually use:**
```
From teams
├── id, name, abbreviation, venue

From schedule
├── gamePk, gameDate, teams, status

From boxscore
├── players, battingOrder
└── stats per player

From plays
├── about (inning, outs)
├── result (event, description)
└── matchup (batter, pitcher)
```

---

### Shared Understanding

**Data flow for all sports:**
```
External API
    ↓
Fetcher (raw data)
    ↓
Transformer (clean and normalize)
    ↓
Database Writer (store in SQLite)
    ↓
Cache Metadata updated
```

---

## Step 2 — Setup Data Folder Structure

**What we do:**
```
Create all files needed in the data folder
Most are empty shells at first
We fill them one by one
```

**Full structure:**
```
src/data/
│
├── fetcher.manager.ts → Master coordinator
├── nba/
│ ├── nba.fetcher.ts → Pulls raw NBA data
│ ├── nba.transformer.ts → Cleans NBA data
│ └── nba.types.ts → TypeScript types for NBA
├── nfl/
│ ├── nfl.fetcher.ts → Pulls raw NFL data
│ ├── nfl.transformer.ts → Cleans NFL data
│ └── nfl.types.ts → TypeScript types for NFL
├── mlb/
│ ├── mlb.fetcher.ts → Pulls raw MLB data
│ ├── mlb.transformer.ts → Cleans MLB data
│ └── mlb.types.ts → TypeScript types for MLB
├── db.writer.ts → Writes all data to SQLite
└── sync.coordinator.ts → Orchestrates full sync
```

---

## Step 3 — Master Fetcher Manager

**What this file does:**
```
Single entry point for all data fetching
Any part of the app that needs data
calls the fetcher manager
not the individual fetchers directly
```

**Responsibilities:**
```
1. Check cache metadata before fetching
   └── If data is fresh → skip fetch, return cached flag
   └── If data is stale or missing → proceed with fetch

2. Route request to correct sport fetcher
   └── NBA request → nba.fetcher.ts
   └── NFL request → nfl.fetcher.ts
   └── MLB request → mlb.fetcher.ts

3. Handle rate limiting
   └── Track requests per minute per API
   └── Queue requests if near limit
   └── Wait and retry if limit hit

4. Handle retries on failure
   └── Retry up to 3 times
   └── Exponential backoff between retries
   └── 1 second, 2 seconds, 4 seconds

5. Log all fetch operations
   └── What was fetched
   └── How long it took
   └── Success or failure
   └── Record count returned

6. Update cache metadata after successful fetch
```

**Functions the manager exposes:**
```
fetchTeams(sport)
└── Gets all teams for a sport

fetchPlayers(sport, teamId?)
└── Gets all players, optionally filtered by team

fetchGames(sport, season, dateRange?)
└── Gets all games for a season

fetchPlayerGameLogs(sport, playerId, season)
└── Gets game by game stats for one player

fetchPlayByPlay(sport, gameId)
└── Gets every play for one game

fetchRosters(sport, teamId)
└── Gets current roster for a team

syncAllData(sport)
└── Runs full sync for a sport in correct order
```

**Internal helpers:**
```
checkCacheValid(cacheKey)
└── Returns true if cache exists and not expired

updateCacheMetadata(cacheKey, recordCount)
└── Updates CacheMetadata table after fetch

handleRateLimit(apiName)
└── Manages request counting and waiting

retryWithBackoff(fetchFn, maxRetries)
└── Wraps any fetch function with retry logic
```

---

## Step 4 — NBA Data Fetcher

**What this does:**
```
All direct calls to BallDontLie API
Returns raw data exactly as the API gives it
No transformation here
Just fetch and return
```

### Step 4.1 — NBA HTTP Client Setup

**What we configure:**
```
Base URL → https://api.balldontlie.io/v1
Headers
├── Authorization: Bearer {BALLDONTLIE_API_KEY}
└── Content-Type: application/json
Timeout → 10 seconds per request
```

**All requests go through this single configured client**
**No scattered API calls anywhere else**

---

### Step 4.2 — Fetch NBA Teams

**Endpoint:** GET /teams

**What we send:**
```
No parameters needed
Returns all 30 NBA teams in one call
```

**What we get back per team:**
```
id
name
full_name
abbreviation
city
conference
division
```

**Pagination handling:**
```
API returns paginated results
We loop through all pages automatically
Until next_page is null
Combine all pages into one array
Return complete list
```

---

### Step 4.3 — Fetch NBA Players

**Endpoint:** GET /players

**Parameters we send:**
```
per_page → 100 (max allowed)
page → increments through all pages
team_ids[] → optional filter by team
```

**What we get back per player:**
```
id
first_name
last_name
position
height
weight
team (nested object with team details)
```

**Pagination handling:**
```
Same loop approach as teams
Collect all pages
Return full array
```

---

### Step 4.4 — Fetch NBA Games

**Endpoint:** GET /games

**Parameters we send:**
```
seasons[] → [2024] for current season
per_page → 100
page → paginate through all
start_date → optional date filter
end_date → optional date filter
team_ids[] → optional team filter
```

**What we get back per game:**
```
id
date
season
status
period
home_team (nested)
home_team_score
visitor_team (nested)
visitor_team_score
```

---

### Step 4.5 — Fetch NBA Player Stats (Game Logs)

**Endpoint:** GET /stats

**Parameters we send:**
```
player_ids[] → specific player
seasons[] → [2024]
per_page → 100
page → paginate
```

**What we get back per stat entry:**
```
id
player (nested)
team (nested)
game (nested with date and opponent)
min (minutes as string like "32:14")
pts
reb
ast
stl
blk
turnover
pf
fga, fgm, fg_pct
fg3a, fg3m, fg3_pct
fta, ftm, ft_pct
```

**Important — Minutes field:**
```
API returns minutes as "32:14" string format
We need to convert to decimal
32:14 becomes 32.23 minutes
Handle this in transformer not here
```

---

### Step 4.6 — NBA Rate Limit Handling

**BallDontLie free tier limits:**
```
30 requests per minute
We track requests with a simple counter
If we hit 25 requests in a minute
we pause for the remainder of that minute
Then continue
```

**Retry behavior:**
```
On 429 (rate limit) response
→ Wait 60 seconds
→ Retry the same request
→ Log the wait

On 500 or network error
→ Wait with exponential backoff
→ Retry up to 3 times
→ Log each attempt
```

---

## Step 5 — NFL Data Fetcher

**Two approaches depending on Python service readiness:**

```
Approach A → Python ML service is ready
             Node calls Python which calls nfl_data_py
             Returns full play by play data

Approach B → Python not ready yet
             Use ESPN public API directly from Node
             Less data but works immediately
```

**We build both and use whichever is available**

---

### Step 5.1 — ESPN NFL Fetcher (Approach B — Direct)

**Base URL:** https://site.api.espn.com/apis/site/v2/sports/football/nfl

**Fetch NFL Teams:**
```
Endpoint → /teams
No auth needed
Returns all 32 NFL teams with
├── id, name, abbreviation, location
├── color, logo
└── conference and division
```

**Fetch NFL Schedule:**
```
Endpoint → /scoreboard
Parameters
├── seasontype → 2 (regular season) / 3 (playoffs)
├── week → week number
└── dates → date range

Returns games with
├── id, date, status
├── home team and score
└── away team and score
```

**Fetch NFL Game Summary:**
```
Endpoint → /summary
Parameters
└── event → game ID

Returns
├── Full box score
├── Scoring plays
└── Team stats
```

---

### Step 5.2 — Python NFL Fetcher (Approach A — Via Microservice)

**What Node sends to Python:**
```
POST http://localhost:8001/nfl/plays
Body
├── season → 2024
├── week → optional week filter
└── team → optional team filter
```

**What Python returns:**
```
Array of play objects each containing
├── game_id
├── play_id
├── desc (text description)
├── down
├── ydstogo
├── yardline_100
├── play_type
├── posteam (possession team)
├── defteam (defensive team)
├── score_differential
├── game_seconds_remaining
├── fourth_down_converted
├── fourth_down_failed
├── timeout
├── two_point_conv_result
└── Many more fields
```

**This data is gold for Module 2 (Decision Quality)**
```
Every 4th down play has
├── Was it converted or not
├── Field position
├── Score and time
└── We extract coaching decisions from this
```

---

### Step 5.3 — Coach Decision Extraction

**This is a special NFL fetcher function:**
```
Takes raw play by play data
Identifies every 4th down play
Extracts the coaching decision

For each 4th down play we capture
├── Was it a go for it / punt / field goal
├── Field position (yard line)
├── Yards to go
├── Score differential
├── Time remaining
├── Quarter
└── Result

Also extracts
├── Timeout decisions (when called and situation)
└── 2 point conversion decisions
```

**This gets called after fetchPlayByPlay**
**Returns structured decision objects ready for CoachDecisions table**

---

## Step 6 — MLB Data Fetcher

**Base URL:** https://statsapi.mlb.com/api/v1

**No authentication needed**
**Official MLB API, completely free and reliable**

---

### Step 6.1 — Fetch MLB Teams

**Endpoint:** GET /teams

**Parameters:**
```
sportId → 1 (MLB)
season → 2024
```

**Returns per team:**
```
id, name, abbreviation
teamName, locationName
league (AL or NL)
division
venue (stadium info)
```

---

### Step 6.2 — Fetch MLB Schedule

**Endpoint:** GET /schedule

**Parameters:**
```
sportId → 1
season → 2024
gameType → R (regular) / P (playoff)
startDate → date filter
endDate → date filter
```

**Returns per game:**
```
gamePk (game ID)
gameDate
status (Final, Live, Scheduled)
teams
├── home (team info + score)
└── away (team info + score)
```

---

### Step 6.3 — Fetch MLB Box Score

**Endpoint:** GET /game/{gamePk}/boxscore

**Returns:**
```
Teams
├── home and away team data
Players
├── Each player with full stats
│ ├── batting stats
│ ├── pitching stats
│ └── fielding stats
Pitchers
└── Starting and relief pitchers used
```

---

### Step 6.4 — Fetch MLB Play by Play

**Endpoint:** GET /game/{gamePk}/playByPlay

**Returns:**
```
Array of all plays in the game
Each play contains
├── about
│ ├── atBatIndex
│ ├── inning
│ ├── isTopInning
│ └── outs
├── result
│ ├── event (Home Run, Strikeout, Walk etc)
│ ├── description
│ └── rbi
└── matchup
    ├── batter
    └── pitcher
```

---

## Step 7 — Data Transformer Layer

**What transformers do:**
```
Take raw API response
Convert it to our standard database shape
Every sport's data looks different coming in
Transformers make it all look the same going into DB
```

---

### Step 7.1 — NBA Transformer

**transformTeam(rawTeam):**
```
Input → BallDontLie team object
Output → Our Teams table shape
Maps
├── id → externalId
├── full_name → name
├── city → city
├── abbreviation → abbreviation
├── conference → conference
└── division → division
Also adds → sportId for NBA
```

**transformPlayer(rawPlayer):**
```
Input → BallDontLie player object
Output → Our Players table shape
Maps
├── id → externalId
├── first_name → firstName
├── last_name → lastName
├── name → firstName + lastName
├── position → position
├── team.id → externalTeamId (for lookup)
└── height/weight conversion to inches/lbs
```

**transformGame(rawGame):**
```
Input → BallDontLie game object
Output → Our Games table shape
Maps
├── id → externalId
├── date → date (parsed to DateTime)
├── season → season
├── status → status
├── home_team.id → homeTeamExternalId
├── visitor_team.id → awayTeamExternalId
├── home_team_score → homeScore
└── visitor_team_score → awayScore
```

**transformGameLog(rawStat):**
```
Input → BallDontLie stats object
Output → Our PlayerGameLogs table shape
Special handling
├── min "32:14" → 32.23 (decimal minutes)
├── Compute backToBack from game dates
├── Compute daysRestBefore from previous game
├── Compute gamesLast7Days count
├── Compute gamesLast14Days count
└── Compute gamesLast21Days count
Store full raw stat in rawBoxScore JSON field
```

---

### Step 7.2 — NFL Transformer

**transformTeam(rawTeam):**
```
ESPN format to our Teams shape
Maps ESPN team structure to our standard fields
Adds sportId for NFL
```

**transformPlay(rawPlay):**
```
nfl_data_py play to our PlayByPlay shape
Maps
├── game_id → externalGameId
├── play_id → eventNumber
├── desc → description
├── play_type → eventType
├── posteam → teamExternalId
├── score_differential → scoreDiff
└── game_seconds_remaining → eventTimeSeconds
Computes
├── homeScore and awayScore from differential and context
└── isScoring from play_type
```

**transformDecision(rawPlay, coachContext):**
```
Extracts coaching decision from a 4th down play
Output shape matches CoachDecisions table exactly
├── decisionType → "4th_down"
├── chosenAction → "go" / "punt" / "field_goal"
├── gameContext → full situation as JSON
└── outcome → "converted" / "failed" / "made" / "missed"
```

---

### Step 7.3 — MLB Transformer

**transformTeam(rawTeam):**
```
MLB Stats API team to our shape
Maps league to conference field
```

**transformGame(rawGame):**
```
Schedule entry to our Games shape
gamePk → externalId
gameDate → date
```

**transformPlay(rawPlay):**
```
Play by play event to our PlayByPlay shape
event → eventType
description → description
inning → period
```

---

## Step 8 — Database Writer Layer

**What db.writer.ts does:**
```
Takes transformed data
Writes it to SQLite via Prisma
Handles conflicts (upsert not insert)
Logs what was written
Returns counts of records written
```

**Why upsert not insert:**
```
If we run a sync twice
we don't want duplicate records
Upsert = update if exists, insert if not
Prisma makes this clean with upsertMany
```

**Functions in db.writer.ts:**

**writeTeams(teams, sportId):**
```
Input → Array of transformed team objects
Action → Upsert each team by externalId + sportId
Output → Count of records written
```

**writePlayers(players, sportId):**
```
Input → Array of transformed player objects
Lookup → Find real teamId from externalTeamId
Action → Upsert each player by externalId + sportId
Output → Count written
```

**writeGames(games, sportId):**
```
Input → Array of transformed game objects
Lookup → Find real teamIds from external IDs
Action → Upsert each game by externalId + sportId
Output → Count written
```

**writePlayerGameLogs(logs):**
```
Input → Array of transformed game log objects
Lookup → Find real playerId and gameId
Action → Upsert by playerId + gameId
Output → Count written
```

**writePlayByPlay(plays, gameId):**
```
Input → Array of transformed play objects
Action → Delete existing plays for game then insert fresh
Why → Play by play doesn't change, full replace is safe
Output → Count written
```

**writeCoachDecisions(decisions):**
```
Input → Array of transformed decision objects
Lookup → Find real coachId and gameId
Action → Upsert by gameId + coachId + decisionType + period
Output → Count written
```

**Batch writing strategy:**
```
Don't write one record at a time
Batch into groups of 100
Write 100 at a time using Prisma createMany
Much faster for large datasets
```

---

## Step 9 — Sync Coordinator

**What sync.coordinator.ts does:**
```
Orchestrates the full data sync for a sport
Runs everything in the correct order
Teams must exist before players
Players must exist before game logs
Games must exist before play by play
```

**Full sync order:**
```
1. Fetch and write teams
2. Fetch and write coaches (NFL/NBA)
3. Fetch and write players
4. Fetch and write games (schedule)
5. For each completed game
   ├── Fetch and write player game logs
   └── Fetch and write play by play
6. Extract and write coach decisions (NFL)
7. Update all cache metadata
8. Log sync completion summary
```

**syncSport(sport, season) function:**
```
Main entry point
Calls each step in order
If any step fails
├── Log the error
├── Continue to next step if possible
└── Report partial success
Never let one failure break everything
```

**syncRecentGames(sport, daysBack) function:**
```
Only syncs last N days of games
Used by background jobs
Much faster than full sync
Called every 6 hours
```

**Sync result object:**
```
sport
season
startedAt
completedAt
durationSeconds
counts
├── teams
├── players
├── games
├── gameLogs
├── playByPlay
└── decisions
errors → array of any errors that occurred
status → "complete" / "partial" / "failed"
```

---

## Step 10 — Testing All Fetchers

**What we verify before moving to Phase 4:**

**Test 1 — NBA Teams Fetch:**
```
Call fetchTeams("NBA")
Verify 30 teams returned
Verify each team has required fields
Check teams are written to SQLite
Open DB and count teams table rows
```

**Test 2 — NBA Players Fetch:**
```
Call fetchPlayers("NBA")
Verify players returned with team references
Check players written to SQLite
Verify externalId and teamId populated
```

**Test 3 — NBA Game Logs:**
```
Call fetchPlayerGameLogs("NBA", somePlayerId, "2024")
Verify minutes conversion works (string to decimal)
Verify back to back calculation correct
Verify rest days calculation correct
Check records written to DB
```

**Test 4 — NFL Play by Play:**
```
Call fetchPlayByPlay("NFL", someGameId)
Verify 4th down plays are present
Verify decision extraction working
Check CoachDecisions table populated
```

**Test 5 — MLB Basic Fetch:**
```
Call fetchTeams("MLB")
Verify 30 teams
Call fetchGames("MLB", "2024")
Verify games returned
```

**Test 6 — Cache Metadata:**
```
Run any fetch twice
Second run should detect valid cache
Should skip the API call
Should log "cache hit"
Verify CacheMetadata table has entries
```

**Test 7 — Full Sync:**
```
Call syncSport("NBA", "2024")
Watch the logs
Verify correct order of operations
Check sync result object
Confirm all tables populated
```

---

## Phase 3 Summary

| Step | What It Builds | Output |
|---|---|---|
| Step 1 | Understand data sources | Knowledge of all 3 APIs |
| Step 2 | Folder structure | All data files created |
| Step 3 | Fetcher manager | Central coordinator |
| Step 4 | NBA fetcher | All NBA data pulling |
| Step 5 | NFL fetcher | All NFL data pulling |
| Step 6 | MLB fetcher | All MLB data pulling |
| Step 7 | Transformers | Data normalization layer |
| Step 8 | DB writer | SQLite storage layer |
| Step 9 | Sync coordinator | Orchestrated full sync |
| Step 10 | Testing | Verified everything works |

---

## What Phase 3 Delivers

```
After Phase 3 is complete

SQLite database contains
├── All NBA teams and players
├── All NFL teams and coaches
├── All MLB teams and players
├── Game logs for current season
├── Play by play for recent games
├── Extracted coaching decisions
└── Cache metadata for all fetched data

The backend can now
├── Answer "give me all Lakers players"
├── Answer "give me LeBron's last 21 game logs"
├── Answer "give me all 4th down decisions this season"
└── Answer "give me play by play for game X"

Phase 4 (Python ML) can now
└── Read this data and run models on it
```

**Phase 3 is the data foundation everything else sits on**
**Without clean data in the DB nothing else works**
**This phase done right makes every other phase easier**
