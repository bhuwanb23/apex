# Phase 7 — Caching Layer — Step by Step

---

## Overview of Steps

```
Step 1 → Understand the caching strategy
Step 2 → Setup cache configuration
Step 3 → Build in memory cache (7.1)
Step 4 → Build SQLite cache layer (7.2)
Step 5 → Build cache key system
Step 6 → Build cache middleware (7.3)
Step 7 → Build cache invalidation system
Step 8 → Integrate cache into all routes
Step 9 → Build cache monitoring
Step 10 → Test the entire cache system
```

---

## Step 1 — Understand the Caching Strategy

**Why caching matters for this app:**
```
Without caching
├── Every request hits SQLite
├── Every risk score request calls Python ML
├── Every leaderboard request runs DB aggregation
├── Sports API calls happen on every request
└── App feels slow, judges are unimpressed

With caching
├── Most requests return in under 10ms
├── Python ML called only when truly needed
├── Sports APIs called on schedule not on demand
├── App feels instant and professional
└── Judges see a fast polished product
```

**Two layer cache architecture:**
```
Layer 1 — In Memory Cache (node-cache)
├── Fastest possible — pure RAM
├── Lost on server restart
├── Best for frequently changing data
│   Search results, alerts, active data
└── Small TTLs (30 min to 1 hour)

Layer 2 — SQLite Cache (CacheMetadata table)
├── Persists across restarts
├── Slightly slower than memory
├── Best for computed results
│   Risk scores, leaderboards, momentum
└── Longer TTLs (6 hours to 7 days)
```

**Cache lookup order:**
```
Request comes in
        ↓
Check Layer 1 (memory)
├── Hit → return immediately (fastest)
└── Miss
        ↓
Check Layer 2 (SQLite)
├── Hit → load into memory → return
└── Miss
        ↓
Compute fresh data
├── Call DB or ML service
├── Store in Layer 2 (SQLite)
├── Store in Layer 1 (memory)
└── Return to client
```

**Stale while revalidate pattern:**
```
Special behavior for some routes
When cached data is slightly stale
├── Return stale data immediately (fast)
└── Trigger background recomputation
    Update cache with fresh data
    Next request gets fresh data

Better user experience than waiting for fresh compute
Judges see instant responses
Data is at most one TTL period old
```

---

## Step 2 — Setup Cache Configuration

**File:** src/utils/cache.config.ts

**What this file defines:**
```
Central place for all cache settings
Change a TTL in one place
Affects entire app
```

**Cache TTL definitions:**
```
All values in seconds

IN MEMORY TTLs
├── SEARCH_RESULTS        → 3600      (1 hour)
├── TEAM_LISTS            → 86400     (24 hours)
├── ACTIVE_ALERTS         → 1800      (30 minutes)
├── SPORT_CONFIG          → 86400     (24 hours)
├── PLAYER_BASIC_INFO     → 86400     (24 hours)
└── ML_SERVICE_HEALTH     → 900       (15 minutes)

SQLITE TTLs
├── RISK_SCORES           → 21600     (6 hours)
├── COACH_LEADERBOARD     → 86400     (24 hours)
├── MOMENTUM_ANALYSIS     → 86400     (24 hours)
├── STORY_TEXT            → 3600      (1 hour)
├── GAME_MOMENTUM         → 86400     (24 hours)
├── TIMEOUT_RECOMMENDATIONS → 2592000 (30 days)
└── SEASON_DATA           → 604800    (7 days)

STALE WHILE REVALIDATE THRESHOLDS
├── ALERTS_STALE_AFTER    → 1800      (30 minutes)
├── LEADERBOARD_STALE_AFTER → 43200   (12 hours)
└── MOMENTUM_STALE_AFTER  → 43200     (12 hours)
```

**Cache data type enum:**
```
Defines all valid cache data types
Used as keys in CacheMetadata table

PLAYER_LOGS
RISK_SCORES
COACH_DECISIONS
COACH_LEADERBOARD
PLAY_BY_PLAY
MOMENTUM_ANALYSIS
GAME_MOMENTUM
STORY_TEXT
SEARCH_RESULTS
TEAM_DATA
PLAYER_DATA
TIMEOUT_RECOMMENDATIONS
SPORT_CONFIG
```

---

## Step 3 — Build In Memory Cache (7.1)

**File:** src/services/memory.cache.service.ts

**What node-cache provides:**
```
Simple key-value store in RAM
TTL per key (auto expires)
Event hooks (on expired, on set)
Stats (hit rate, key count)
```

**Setup configuration:**
```
node-cache instance options
├── stdTTL          → 3600 (default 1 hour)
├── checkperiod     → 120  (check for expired every 2 min)
├── useClones       → false (return references not copies)
│                     faster but caller must not mutate
└── deleteOnExpire  → true (auto delete when TTL reached)
```

**Why useClones false:**
```
Cloning large objects is slow
We trust our code not to mutate cached objects
Significant performance gain on large datasets
```

---

### Step 3.1 — Memory Cache Functions

**get(key):**
```
Input  → cache key string
Output → cached value or undefined

Internally
├── node-cache.get(key)
├── If found increment hit counter
├── If not found increment miss counter
└── Return value or undefined
```

**set(key, value, ttl?):**
```
Input  → key, value, optional TTL override
Output → boolean success

Internally
├── node-cache.set(key, value, ttl)
├── Log cache write at debug level
└── Return success boolean
```

**del(key):**
```
Input  → single key or array of keys
Output → number of deleted keys

Used for manual invalidation
```

**flush():**
```
Clears entire memory cache
Used during testing
and after major data updates
```

**getStats():**
```
Returns node-cache statistics
├── keys        → total keys stored
├── hits        → total cache hits
├── misses      → total cache misses
├── hitRate     → calculated percentage
└── ksize       → memory used by keys
```

---

### Step 3.2 — Specific Memory Cache Helpers

**These wrap the generic get/set with typed data:**

**cacheSearchResults(query, sport, results):**
```
Key format  → "search:players:{sport}:{query}"
TTL         → SEARCH_RESULTS (1 hour)
Stores      → array of player search results
```

**getSearchResults(query, sport):**
```
Key format  → same as above
Returns     → array or undefined
```

**cacheTeamList(sport, teams):**
```
Key format  → "teams:{sport}"
TTL         → TEAM_LISTS (24 hours)
Stores      → array of team objects
```

**cacheActiveAlerts(sport, zone, alerts):**
```
Key format  → "alerts:{sport}:{zone}"
TTL         → ACTIVE_ALERTS (30 minutes)
Stores      → array of risk alert objects
```

**cacheSportConfig(sport, config):**
```
Key format  → "sport:config:{sport}"
TTL         → SPORT_CONFIG (24 hours)
```

**cacheMLHealth(status):**
```
Key format  → "ml:health"
TTL         → ML_SERVICE_HEALTH (15 minutes)
Stores      → health status object
```

---

### Step 3.3 — Memory Cache Key Conventions

**All keys follow strict naming patterns:**
```
Search results
└── "search:{entity}:{sport}:{query}"
    e.g. "search:players:NBA:lebr"

Team data
└── "teams:{sport}"
    e.g. "teams:NBA"

Alerts
└── "alerts:{sport}:{zone}"
    e.g. "alerts:NBA:red"

Player info
└── "player:info:{playerId}"
    e.g. "player:info:237"

Sport config
└── "sport:config:{sport}"
    e.g. "sport:config:NFL"

ML health
└── "ml:health"
```

**Naming convention rules:**
```
Always lowercase
Colon separated segments
Most specific part last
No spaces or special characters
Consistent across entire codebase
```

---

## Step 4 — Build SQLite Cache Layer (7.2)

**File:** src/services/sqlite.cache.service.ts

**What this does:**
```
Uses the CacheMetadata table in SQLite
as a persistent cache registry
Combined with the actual data
stored in their own tables (risk scores etc)

CacheMetadata tells us
├── What data exists
├── When it was computed
├── When it expires
└── Whether it is valid

The actual data lives in proper tables
InjuryRiskScores, MomentumAnalysis etc
Not stored as blobs in cache table
```

**Why not store data in cache table:**
```
Storing raw JSON blobs in SQLite is fine for small data
But risk scores, leaderboards need to be queryable
If we stored them as blobs
├── Can't filter by zone
├── Can't sort by evRate
└── Can't join with player data

So we use CacheMetadata as a registry
and read actual data from proper tables
```

---

### Step 4.1 — SQLite Cache Functions

**isCacheValid(cacheKey):**
```
Input  → cache key string
Output → boolean

Query CacheMetadata
WHERE cacheKey = key
AND isValid = true
AND expiresAt > now()

Returns true if valid fresh record exists
Returns false if missing, invalid, or expired
```

**isCacheStale(cacheKey):**
```
Input  → cache key string
Output → { isStale: boolean, staleSince: datetime }

More nuanced than isValid
Returns true when data exists but is past expiry
Used for stale-while-revalidate pattern
```

**markCacheValid(cacheKey, dataType, meta):**
```
Input
├── cacheKey
├── dataType   → enum value
├── meta object
│   ├── sportId
│   ├── entityId
│   ├── season
│   ├── recordCount
│   └── ttl (which TTL constant to use)

Creates or updates CacheMetadata record
├── cachedAt    → now
├── expiresAt   → now + ttl
├── isValid     → true
└── recordCount → from meta
```

**markCacheInvalid(cacheKey):**
```
Input  → cache key or array of keys
Action → Set isValid = false in CacheMetadata
Used when we know data is stale
and want to force recomputation
```

**getCacheInfo(cacheKey):**
```
Input  → cache key
Output → full CacheMetadata record or null
Used for debug and monitoring routes
```

**getExpiredCaches(dataType?):**
```
Input  → optional data type filter
Output → array of expired CacheMetadata records

Used by cleanup job
Lists all cache entries past their expiry
```

**getCacheStats():**
```
Returns summary of all cache entries
├── totalEntries
├── validEntries
├── expiredEntries
├── byDataType breakdown
└── oldestEntry
```

---

### Step 4.2 — SQLite Cache Specific Helpers

**These handle the most common cache operations:**

**Risk Score Cache:**
```
isRiskScoreFresh(playerId)
├── Check CacheMetadata for key "risk:{playerId}"
└── Return boolean

markRiskScoreComputed(playerId)
├── Upsert CacheMetadata for "risk:{playerId}"
└── TTL → RISK_SCORES (6 hours)

Note: Actual risk data is in InjuryRiskScores table
This just tracks freshness
```

**Coach Leaderboard Cache:**
```
isLeaderboardFresh(sport, season, decisionType)
├── Key format "leaderboard:{sport}:{season}:{decisionType}"
└── Check CacheMetadata

markLeaderboardComputed(sport, season, decisionType)
└── Update CacheMetadata with 24 hour TTL
```

**Momentum Analysis Cache:**
```
isMomentumFresh(sport, season)
├── Key format "momentum:season:{sport}:{season}"
└── Check CacheMetadata

markMomentumComputed(sport, season)
└── Update CacheMetadata with 24 hour TTL
```

**Story Cache:**
```
isStoryFresh(storyKey)
├── Check StoryLogs table directly
│   WHERE storyKey = key
│   AND expiresAt > now()
└── Return boolean

Note: Story text stored in StoryLogs table
Has its own expiry column
No separate CacheMetadata needed
```

---

## Step 5 — Build Cache Key System

**File:** src/utils/cache.keys.ts

**What this does:**
```
Single file that defines every cache key
Used consistently across all services
No string duplication anywhere
Change a key format in one place
```

**Cache key builder functions:**

**Keys for memory cache:**
```
searchPlayersKey(sport, query)
→ "search:players:{sport}:{query}"

searchTeamsKey(sport, query)
→ "search:teams:{sport}:{query}"

teamListKey(sport)
→ "teams:{sport}"

alertsKey(sport, zone)
→ "alerts:{sport}:{zone}"

playerInfoKey(playerId)
→ "player:info:{playerId}"

sportConfigKey(sport)
→ "sport:config:{sport}"
```

**Keys for SQLite cache:**
```
riskScoreKey(playerId)
→ "risk:{playerId}"

teamRiskKey(teamId)
→ "risk:team:{teamId}"

leaderboardKey(sport, season, decisionType, gameType)
→ "leaderboard:{sport}:{season}:{decisionType}:{gameType}"

momentumSeasonKey(sport, season)
→ "momentum:season:{sport}:{season}"

momentumGameKey(gameId)
→ "momentum:game:{gameId}"

timeoutKey(sport, scenarioKey)
→ "timeout:{sport}:{scenarioKey}"
```

**Keys for story logs:**
```
storyKey(module, sport, role, entityId)
→ Hash of all inputs combined
→ MD5 or simple string concatenation
→ "story:{module}:{sport}:{role}:{entityId}"
```

---

## Step 6 — Build Cache Middleware (7.3)

**File:** src/middleware/cache.middleware.ts

**What middleware does:**
```
Sits between router and controller
Checks cache before controller runs
Returns cached response immediately if found
Lets controller run if cache is empty
Stores controller response in cache automatically
```

**Three behaviors based on cache state:**
```
HIT   → Data in cache and fresh
        Return immediately
        Controller never runs
        Response in under 10ms

MISS  → No data in cache
        Let controller run
        Store result in cache
        Return result to client

STALE → Data exists but past TTL
        Return stale data immediately (fast)
        Trigger background recompute
        Next request gets fresh data
```

---

### Step 6.1 — Generic Cache Middleware Factory

**createCacheMiddleware(options):**
```
A factory function
Returns an Express middleware function
Configured with options

Options object
├── ttl           → how long to cache in seconds
├── keyBuilder    → function that builds cache key from request
├── cacheLayer    → "memory" / "sqlite" / "both"
├── allowStale    → boolean, enable stale-while-revalidate
├── staleThreshold → seconds before triggering background refresh
└── varyBy        → array of query params that affect cache
                    ["sport", "season", "role"] etc
```

**How the middleware function works:**
```
Step 1 — Build cache key
└── Call keyBuilder(req) to get unique key
    Based on URL params and query params

Step 2 — Check memory cache first
├── If found and fresh → return immediately
└── If not found → continue

Step 3 — Check SQLite cache
├── If found → load into memory cache → return
└── If not found → continue to controller

Step 4 — Check if stale exists
├── If allowStale is true
│   and stale data exists
│   ├── Return stale data immediately
│   └── Queue background refresh job
└── If no stale data → continue

Step 5 — Run controller
└── Override res.json to intercept response

Step 6 — Intercept and cache response
├── When controller calls res.json(data)
├── We intercept before sending
├── Store data in memory cache
├── Store metadata in SQLite cache
└── Send response to client
```

**Response interception technique:**
```
Save original res.json function
Replace with wrapper function
Wrapper stores data then calls original
Controller code does not change at all
It still calls res.json normally
Middleware transparently caches it
```

---

### Step 6.2 — Route Specific Middleware Instances

**Each route gets its own configured middleware:**

**For search routes:**
```
searchCacheMiddleware
├── ttl           → 3600 (1 hour)
├── cacheLayer    → "memory" (fast searches)
├── keyBuilder    → builds from q and sport params
├── allowStale    → false (searches should be fresh)
└── varyBy        → ["q", "sport", "limit"]
```

**For team list routes:**
```
teamListCacheMiddleware
├── ttl           → 86400 (24 hours)
├── cacheLayer    → "memory"
├── keyBuilder    → builds from sport param
├── allowStale    → true
└── staleThreshold → 43200 (12 hours)
```

**For alerts route:**
```
alertsCacheMiddleware
├── ttl           → 1800 (30 minutes)
├── cacheLayer    → "memory"
├── keyBuilder    → builds from sport and zone
├── allowStale    → true
└── staleThreshold → 900 (15 minutes)
```

**For coach leaderboard route:**
```
leaderboardCacheMiddleware
├── ttl           → 86400 (24 hours)
├── cacheLayer    → "both" (memory + SQLite)
├── keyBuilder    → builds from sport season decisionType
├── allowStale    → true
└── staleThreshold → 43200 (12 hours)
```

**For momentum analysis route:**
```
momentumCacheMiddleware
├── ttl           → 86400 (24 hours)
├── cacheLayer    → "both"
├── keyBuilder    → builds from sport and season
├── allowStale    → true
└── staleThreshold → 43200 (12 hours)
```

**For risk score route:**
```
riskScoreCacheMiddleware
├── ttl           → 21600 (6 hours)
├── cacheLayer    → "sqlite" (survives restart)
├── keyBuilder    → builds from playerId
├── allowStale    → true
└── staleThreshold → 10800 (3 hours)
```

**For story routes:**
```
storyCacheMiddleware
├── ttl           → 3600 (1 hour)
├── cacheLayer    → "sqlite" (uses StoryLogs table directly)
├── keyBuilder    → builds from module sport role entityId
├── allowStale    → false (stories should be reasonably fresh)
└── special       → checks StoryLogs table not CacheMetadata
```

---

### Step 6.3 — Cache Headers

**Add cache info to every response:**
```
X-Cache-Status header
├── "HIT"       → served from cache
├── "MISS"      → freshly computed
└── "STALE"     → served stale, recomputing in background

X-Cache-Age header
└── Seconds since this data was cached

X-Cache-TTL header
└── Seconds until this cache entry expires

X-Cache-Layer header
├── "memory"    → served from node-cache
├── "sqlite"    → served from SQLite cache
└── "fresh"     → not cached, just computed

These headers are visible in browser dev tools
Judges can see caching working live
Very impressive during demo
```

---

## Step 7 — Build Cache Invalidation System

**File:** src/services/cache.invalidation.ts

**What cache invalidation does:**
```
When data changes we need to remove old cached versions
Otherwise stale data gets served indefinitely
```

**Invalidation triggers:**
```
Data sync job completes
└── Invalidate all player and team caches
    for the sport that was synced

Risk compute job completes
└── Invalidate risk score caches
    for all players that were recomputed

Momentum job completes
└── Invalidate momentum analysis caches
    for sports that were updated

Manual recalculate request
└── Invalidate specific player's risk cache

Coach leaderboard recomputed
└── Invalidate leaderboard cache for that sport
```

---

### Step 7.1 — Invalidation Functions

**invalidatePlayerCache(playerId):**
```
Remove from memory cache
├── "player:info:{playerId}"
└── "risk:score:{playerId}" (if in memory)

Mark SQLite cache invalid
└── "risk:{playerId}" in CacheMetadata

Does NOT delete the actual data
Only marks it stale so it gets recomputed
```

**invalidateTeamCache(teamId, sport):**
```
Remove from memory cache
├── "risk:team:{teamId}"
└── "alerts:{sport}:red"
    "alerts:{sport}:yellow"
    "alerts:{sport}:green"

Remove team list cache if rosters changed
└── "teams:{sport}"
```

**invalidateSportCache(sport):**
```
Invalidates all caches related to a sport
Used after full sport data sync

Memory cache
├── All alert keys for sport
├── Team list for sport
└── All search results for sport

SQLite cache
└── Mark all CacheMetadata invalid
    WHERE sportId = thisId
    AND dataType IN (relevant types)
```

**invalidateLeaderboard(sport, season):**
```
Remove from memory if stored there
Mark SQLite CacheMetadata invalid
└── All leaderboard keys for sport + season
```

**invalidateAllCaches():**
```
Nuclear option — clear everything
Used in testing
and when major schema changes happen

Flush node-cache completely
Mark all CacheMetadata as invalid in SQLite
Log the full flush
```

---

### Step 7.2 — Smart Invalidation After Jobs

**In data sync job after completion:**
```
Call invalidateSportCache(sport)
for each sport that was synced

This ensures
├── Next search request gets fresh players
├── Next team request gets fresh roster
└── Next alert request recomputes from fresh data
```

**In risk compute job after completion:**
```
For each player whose score changed zones
├── Call invalidatePlayerCache(playerId)
└── Call invalidateTeamCache(teamId, sport)

This ensures
├── Next risk request gets fresh score
└── Next team request shows updated traffic light
```

**In momentum job after completion:**
```
For each sport where analysis was updated
└── Call invalidateLeaderboard equivalent for momentum
    Specifically invalidate momentumSeasonKey
```

---

## Step 8 — Integrate Cache Into All Routes

**What changes in route files:**
```
Add appropriate cache middleware to each route
One line addition per route
No changes to controllers needed
```

**Route integration pattern:**
```
Before cache
router.get("/coaches/:sport", coachController.getLeaderboard)

After cache
router.get("/coaches/:sport",
  leaderboardCacheMiddleware,
  coachController.getLeaderboard
)

The middleware runs first
If cache hit → response sent, controller never runs
If cache miss → controller runs, response cached
```

**Routes that get caching:**
```
GET /api/injury/player/:playerId
└── riskScoreCacheMiddleware

GET /api/injury/team/:teamId
└── teamRiskCacheMiddleware

GET /api/injury/alerts/:sport
└── alertsCacheMiddleware

GET /api/decisions/coaches/:sport
└── leaderboardCacheMiddleware

GET /api/decisions/coach/:coachId
└── coachDetailCacheMiddleware (1 hour TTL)

GET /api/momentum/analysis/:sport
└── momentumCacheMiddleware

GET /api/momentum/comparison
└── comparisonCacheMiddleware (24 hour TTL)

GET /api/momentum/timeout/:sport
└── timeoutCacheMiddleware (7 day TTL, rarely changes)

GET /api/search/players
└── searchCacheMiddleware

GET /api/search/teams
└── searchCacheMiddleware

GET /api/story/:module/:sport
└── storyCacheMiddleware
```

**Routes that do NOT get caching:**
```
POST routes (data changes)
GET /api/health (always fresh)
GET /api/jobs/status (always fresh)
GET /api/momentum/game/:gameId
└── Already has its own DB-based freshness check
    in the controller
```

---

## Step 9 — Build Cache Monitoring

**File:** src/routes/cache.routes.ts

**Purpose:**
```
HTTP endpoints to inspect and manage cache
Useful during demo
Shows judges caching is working
Can clear specific caches for testing
```

---

**Route — GET /api/cache/stats:**
```
Returns comprehensive cache statistics

Response
├── memory
│   ├── keys        → total keys in memory
│   ├── hits        → total hits since startup
│   ├── misses      → total misses since startup
│   ├── hitRate     → percentage
│   └── ksize       → memory used
├── sqlite
│   ├── totalEntries
│   ├── validEntries
│   ├── expiredEntries
│   └── byDataType  → breakdown per type
└── performance
    ├── avgHitResponseMs  → how fast cache hits return
    └── avgMissResponseMs → how fast cache misses return
```

---

**Route — GET /api/cache/entries:**
```
Lists all SQLite cache entries
Query parameters
├── dataType → filter by type
├── sport    → filter by sport
└── valid    → filter by validity

Response
└── Array of CacheMetadata records
    with computed fields
    ├── isExpired boolean
    ├── age in seconds
    └── ttlRemaining in seconds
```

---

**Route — DELETE /api/cache/invalidate:**
```
Manually invalidate cache entries
Protected by X-Admin-Key header

Body options
├── key    → invalidate single key
├── sport  → invalidate all for sport
├── type   → invalidate all of a data type
└── all    → flush everything

Returns count of invalidated entries
```

---

**Route — GET /api/cache/warmup:**
```
Triggers cache warmup
Pre-populates common cache entries
So first user request is fast

Warms up
├── All sport configs
├── All team lists
├── Current red zone alerts for all sports
└── Current season leaderboards

Returns list of what was warmed up
```

---

### Step 9.1 — Cache Warmup on Startup

**What warmup does:**
```
When server starts
Before accepting requests
Pre-populate common cache entries

This ensures
├── First visitor gets fast responses
├── No cold start slowness
└── Demo starts impressively fast
```

**Warmup sequence:**
```
1. Load all sport configs into memory cache
2. Load all team lists into memory cache
3. Fetch and cache current risk alerts
   for each active sport
4. Fetch and cache coach leaderboards
   for each active sport current season
5. Log warmup completion
   "Cache warmed up: X entries loaded in Xms"
```

**When warmup runs:**
```
On server startup always
After RUN_JOBS_ON_STARTUP jobs complete
When triggered via /api/cache/warmup route
```

---

## Step 10 — Test the Entire Cache System

---

**Test 1 — Memory Cache Basic:**
```
□ Make GET /api/search/players?q=james
  Note response time (first request)
  Check X-Cache-Status header → "MISS"

□ Make same request again immediately
  Response time should be much faster
  X-Cache-Status header → "HIT"
  X-Cache-Layer → "memory"

□ Check cache stats
  GET /api/cache/stats
  hits count should be 1
  misses count should be 1
```

---

**Test 2 — SQLite Cache:**
```
□ Make GET /api/decisions/coaches/NFL
  First request → X-Cache-Status "MISS"
  Takes a second (DB aggregation)

□ Make same request again
  X-Cache-Status → "HIT"
  X-Cache-Layer → "sqlite"
  Very fast response

□ Restart the Node server
  Memory cache is cleared on restart

□ Make same request again after restart
  X-Cache-Status → "HIT" still
  X-Cache-Layer → "sqlite"
  SQLite cache survived the restart
  This demonstrates persistence
```

---

**Test 3 — Stale While Revalidate:**
```
□ Make GET /api/injury/alerts/NBA
  Cache status "MISS"

□ Manually expire the cache
  DELETE /api/cache/invalidate
  Body → { "key": "alerts:NBA:red" }

□ Make the request again
  If allowStale is true and stale data exists
  Should return X-Cache-Status "STALE"
  Response still fast
  Background recompute triggered

□ Wait 5 seconds

□ Make request again
  Should now return X-Cache-Status "HIT"
  With fresh data
```

---

**Test 4 — Cache Headers:**
```
□ Open browser dev tools Network tab
□ Make any cached request
□ Inspect response headers
  Verify X-Cache-Status present
  Verify X-Cache-Age present
  Verify X-Cache-TTL present
□ Cache age should increase on repeated requests
□ Status should change from MISS to HIT
```

---

**Test 5 — Cache Invalidation:**
```
□ Cache a leaderboard request
  GET /api/decisions/coaches/NFL
  X-Cache-Status → "HIT" on second request

□ Invalidate via route
  DELETE /api/cache/invalidate
  Body → { "type": "COACH_LEADERBOARD", "sport": "NFL" }

□ Make leaderboard request again
  X-Cache-Status → "MISS"
  Data recomputed fresh
```

---

**Test 6 — Cache Warming:**
```
□ Flush all caches
  DELETE /api/cache/invalidate
  Body → { "all": true }

□ Trigger warmup
  GET /api/cache/warmup

□ Check cache stats
  Several entries should now be loaded

□ Make warmed-up requests
  GET /api/injury/alerts/NBA
  GET /api/decisions/coaches/NFL
  Both should return X-Cache-Status "HIT"
  Without computing anything
```

---

**Test 7 — Concurrent Requests:**
```
□ Flush all caches

□ Send 10 identical requests simultaneously
  Use a load testing tool or Promise.all

□ Only ONE should be a cache miss
  Others should wait and get the cached result
  Prevents cache stampede

This is "dog-pile prevention"
Multiple simultaneous cache misses for same key
should only trigger one computation
Others wait for the first to complete
```

---

**Test 8 — Large Response Caching:**
```
□ Request coach leaderboard
  All coaches for an entire season
  This is a large response

□ Check memory stats
  GET /api/cache/stats
  ksize shows memory usage

□ Second request should be fast
  Large data cached efficiently

□ Memory cache should not grow unbounded
  node-cache TTL ensures cleanup
```

---

**Test 9 — Background Job Cache Integration:**
```
□ Cache some injury alerts
  Make GET /api/injury/alerts/NBA
  X-Cache-Status "HIT" on second request

□ Trigger risk compute job
  POST /api/jobs/trigger
  Body → { "jobName": "risk_compute" }

□ Wait for job to complete

□ Make alert request again
  Should be X-Cache-Status "MISS"
  Job invalidated the cache
  Fresh data recomputed

This proves job and cache integration works
```

---

## Phase 7 Complete File List

```
src/
├── utils/
│   ├── cache.config.ts         ← new (TTL constants)
│   └── cache.keys.ts           ← new (key builders)
│
├── services/
│   ├── memory.cache.service.ts ← new (node-cache wrapper)
│   ├── sqlite.cache.service.ts ← new (CacheMetadata operations)
│   └── cache.invalidation.ts   ← new (invalidation logic)
│
├── middleware/
│   └── cache.middleware.ts     ← updated (full implementation)
│
└── routes/
    └── cache.routes.ts         ← new (monitoring endpoints)
```

---

## Phase 7 Summary

| Step | What It Builds | Key Output |
|---|---|---|
| Step 1 | Strategy understanding | Two layer cache design clear |
| Step 2 | Cache configuration | All TTLs defined centrally |
| Step 3 | Memory cache (7.1) | node-cache fully configured |
| Step 4 | SQLite cache (7.2) | Persistent cache layer |
| Step 5 | Cache key system | Consistent key naming |
| Step 6 | Cache middleware (7.3) | Automatic route caching |
| Step 7 | Invalidation system | Smart cache clearing |
| Step 8 | Route integration | All routes cached |
| Step 9 | Cache monitoring | Stats and control routes |
| Step 10 | Testing | Full system verified |

---

## What Phase 7 Delivers

```
After Phase 7 is complete

Performance
├── Search results return in under 5ms
├── Leaderboards return in under 10ms
├── Risk scores return in under 15ms
└── All cached responses under 20ms

Reliability
├── Cache survives server restart
├── ML service downtime handled gracefully
├── Stale data served during recomputation
└── No cache stampede on cold start

Visibility
├── Every response has cache status headers
├── Cache stats available via API
├── Job and cache integration verified
└── Warmup ensures fast first impression

Judge experience
├── App feels instant from first click
├── Cache headers visible in dev tools
├── Professional monitoring endpoint available
└── Demonstrates production level thinking
```

**Phase 7 is what transforms the app from working to fast**
**Fast is the difference between impressing judges and losing them**
**Every millisecond saved on a cache hit is a better demo**