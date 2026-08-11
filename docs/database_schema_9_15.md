# Tables 9 to 15 — AQX Sports Intelligence
 
---
 
### Table 9 — CoachDecisions
 
**Purpose:** Every extracted coaching decision with full context stored
 
| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| gameId | Integer | Yes | Foreign key to Games |
| coachId | Integer | Yes | Foreign key to Coaches |
| sportId | Integer | Yes | Foreign key to Sports |
| decisionType | String | Yes | "4th_down" / "timeout" / "2pt_conversion" / "intentional_walk" |
| period | Integer | Yes | Which period or quarter this happened |
| clock | String | No | Time remaining on clock when decision made |
| gameTimeSeconds | Float | No | Total seconds elapsed in game at decision point |
| scoreDiff | Integer | Yes | Score difference at moment of decision |
| winProbabilityBefore | Float | No | Win probability right before decision |
| gameContext | JSON | Yes | Full situation snapshot stored as JSON |
| chosenAction | String | Yes | What the coach actually decided to do |
| evChosen | Float | No | Expected value of the action coach chose |
| evBest | Float | No | Expected value of the best available action |
| evDifference | Float | No | How much EV was left on the table |
| isOptimal | Boolean | Yes | Was the chosen action the highest EV option |
| alternativeActions | JSON | Yes | All available options and their EVs stored as JSON |
| outcome | String | No | What actually happened as a result |
| outcomeSuccess | Boolean | No | Did the play physically work out |
| createdAt | DateTime | Yes | Auto set on creation |
 
**Relationships:**
```
Belongs to → Games (via gameId)
Belongs to → Coaches (via coachId)
Belongs to → Sports (via sportId)
```
 
**Indexes:**
```
Index on coachId           → for coach scorecard queries
Index on sportId + decisionType → for filtered leaderboard
Index on isOptimal         → for ranking calculations
Index on gameId            → for game level decision view
```
 
**What gameContext JSON holds:**
```
down              → 4th down / 3rd etc (NFL)
yardsToGo         → yards needed for first down
fieldPosition     → yard line
timeoutsRemaining → how many timeouts left
opponentTimeouts  → opponent timeouts remaining
```
 
---
 
### Table 10 — DecisionEVScores
 
**Purpose:** Aggregated season level scorecard per coach per decision type
 
| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| coachId | Integer | Yes | Foreign key to Coaches |
| sportId | Integer | Yes | Foreign key to Sports |
| season | String | Yes | Season identifier — "2024-25" |
| gameType | String | Yes | "regular" / "playoff" / "all" |
| decisionType | String | Yes | Which category of decision being scored |
| totalDecisions | Integer | Yes | Total number of decisions made |
| optimalDecisions | Integer | Yes | How many of those were optimal |
| suboptimalDecisions | Integer | Yes | How many were not optimal |
| evRate | Float | Yes | Percentage of decisions that were optimal |
| avgEvDifference | Float | No | Average EV left on table per bad decision |
| totalEvLeft | Float | No | Total EV left on table across full season |
| bestDecisionId | Integer | No | Foreign key to best single decision made |
| worstDecisionId | Integer | No | Foreign key to worst single decision made |
| rank | Integer | No | Rank among all coaches in that sport |
| computedAt | DateTime | Yes | When this aggregation was last calculated |
| createdAt | DateTime | Yes | Auto set |
| updatedAt | DateTime | Yes | Auto updates on recompute |
 
**Relationships:**
```
Belongs to → Coaches (via coachId)
Belongs to → Sports (via sportId)
References → CoachDecisions (best and worst decision)
```
 
**Unique constraints:**
```
coachId + season + decisionType + gameType
must all be unique together
One scorecard per coach per season per decision type per game type
```
 
**Indexes:**
```
Index on coachId + season    → for individual coach lookup
Index on sportId + evRate    → for leaderboard sorting
Index on rank                → for quick top N queries
```
 
---
 
### Table 11 — MomentumAnalysis
 
**Purpose:** Season level statistical findings from the Cox model per sport
 
| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| sportId | Integer | Yes | Foreign key to Sports |
| season | String | Yes | Season that was analyzed |
| gamesAnalyzed | Integer | Yes | Total games used to build the model |
| playsAnalyzed | Integer | Yes | Total play by play events analyzed |
| hazardCoefficient | Float | Yes | Main output of Cox proportional hazard model |
| pValue | Float | Yes | Statistical significance value |
| confidenceIntervalLow | Float | Yes | Lower bound of 95% confidence interval |
| confidenceIntervalHigh | Float | Yes | Upper bound of 95% confidence interval |
| isSignificant | Boolean | Yes | True if p-value is below 0.05 |
| effectSize | Float | No | Practical magnitude of the momentum effect |
| streakThreshold | Integer | No | Consecutive scores needed to trigger momentum |
| hazardRateChange | Float | No | Percentage change in opponent scoring hazard |
| modelAccuracy | Float | No | How well the Cox model fit the data |
| plainExplanation | String | Yes | Full plain English paragraph explaining result |
| shortExplanation | String | Yes | One sentence summary for display |
| verdictLabel | String | Yes | "momentum is real" / "momentum is a myth" / "inconclusive" |
| computedAt | DateTime | Yes | When the model was last run |
| createdAt | DateTime | Yes | Auto set |
 
**Relationships:**
```
Belongs to → Sports (via sportId)
```
 
**Unique constraints:**
```
sportId + season must be unique together
One analysis record per sport per season
```
 
**Indexes:**
```
Index on sportId + season    → for fast lookup
Index on isSignificant       → for sport comparison panel
```
 
---
 
### Table 12 — MomentumGameData
 
**Purpose:** Stores the full momentum score timeline for every game for the replay feature
 
| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| gameId | Integer | Yes | Foreign key to Games |
| homeTeamMomentum | JSON | Yes | Array of momentum scores over time for home team |
| awayTeamMomentum | JSON | Yes | Array of momentum scores over time for away team |
| timelineEvents | JSON | Yes | Full event by event breakdown with momentum at each point |
| peakHomeMomentum | Float | No | Highest momentum score home team reached |
| peakAwayMomentum | Float | No | Highest momentum score away team reached |
| peakHomeAt | Float | No | Game time in seconds when home peak happened |
| peakAwayAt | Float | No | Game time in seconds when away peak happened |
| momentumShifts | Integer | No | Total number of times momentum changed hands |
| longestStreak | Integer | No | Longest consecutive scoring run in the game |
| longestStreakTeamId | Integer | No | Which team had the longest streak |
| computedAt | DateTime | Yes | When this was calculated |
| createdAt | DateTime | Yes | Auto set |
 
**Relationships:**
```
Belongs to → Games (via gameId) — one to one
References → Teams (via longestStreakTeamId)
```
 
**Unique constraints:**
```
gameId must be unique
Only one momentum timeline per game ever
```
 
**What timelineEvents JSON holds:**
```
Array of objects each containing
├── eventNumber
├── gameTimeSeconds
├── eventType
├── homeScore
├── awayScore
├── homeMomentumScore
├── awayMomentumScore
└── description
```
 
---
 
### Table 13 — TimeoutRecommendations
 
**Purpose:** Pre-computed timeout optimizer scenarios so results are instant
 
| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| sportId | Integer | Yes | Foreign key to Sports |
| scenarioKey | String | Yes | Unique hash built from all input parameters |
| consecutiveScores | Integer | Yes | Number of consecutive opponent scoring events |
| scoreDiff | Integer | Yes | Current score difference when considering timeout |
| timeRemainingSeconds | Float | Yes | Seconds left in the game |
| period | Integer | Yes | Current period or quarter |
| timeoutsAvailable | Integer | Yes | How many timeouts the team has left |
| shouldCallTimeout | Boolean | Yes | Final recommendation from the model |
| stopProbabilityWith | Float | Yes | Probability of stopping opponent if timeout called |
| stopProbabilityWithout | Float | Yes | Probability of stopping opponent without timeout |
| probabilityDiff | Float | Yes | Difference between the two probabilities |
| recommendationText | String | Yes | Plain English advice for this exact situation |
| confidenceLevel | String | Yes | "high" / "medium" / "low" based on sample size |
| sampleSize | Integer | No | How many historical situations this is based on |
| computedAt | DateTime | Yes | When this scenario was calculated |
| createdAt | DateTime | Yes | Auto set |
 
**Relationships:**
```
Belongs to → Sports (via sportId)
```
 
**Unique constraints:**
```
sportId + scenarioKey must be unique together
One recommendation per unique situation per sport
```
 
**Indexes:**
```
Index on sportId + scenarioKey  → for instant scenario lookup
Index on sportId + consecutiveScores → for range queries
```
 
**How scenarioKey is built:**
```
Hash of
├── sportId
├── consecutiveScores
├── scoreDiff (bucketed into ranges)
├── timeRemainingSeconds (bucketed)
├── period
└── timeoutsAvailable
```
 
---
 
### Table 14 — CacheMetadata
 
**Purpose:** Tracks every piece of cached data so the system knows what is fresh and what needs to be refreshed
 
| Field | Type | Required | Description |
|---|---|---|---|
| id | Integer | Yes | Auto increment primary key |
| cacheKey | String | Yes | Unique string identifying this cache entry |
| dataType | String | Yes | "player_logs" / "risk_scores" / "play_by_play" / "coach_decisions" / "momentum" |
| sportId | Integer | No | Which sport this cache belongs to |
| entityId | String | No | Player ID or team ID or game ID this relates to |
| season | String | No | Which season this data covers |
| cachedAt | DateTime | Yes | Exact time data was last fetched or computed |
| expiresAt | DateTime | Yes | Exact time this cache entry becomes stale |
| recordCount | Integer | No | How many records were stored in this cache |
| isValid | Boolean | Yes | Whether cache is currently usable |
| lastError | String | No | Error message from last failed fetch attempt |
| retryCount | Integer | Yes | How many times fetch has been retried |
| fetchDurationMs | Integer | No | How long the data fetch took in milliseconds |
| createdAt | DateTime | Yes | Auto set on creation |
| updatedAt | DateTime | Yes | Auto updates every time cache is refreshed |
 
**Relationships:**
```
Standalone table
No foreign keys
References everything by string keys
```
 
**Unique constraints:**
```
cacheKey must be globally unique
```
 
**Indexes:**
```
Index on cacheKey           → primary lookup
Index on expiresAt          → for finding stale entries
Index on dataType + sportId → for bulk invalidation
Index on isValid            → for health check queries
```
 
**Cache TTL Rules stored here:**
```
player_logs       → expires 6 hours after cachedAt
risk_scores       → expires 6 hours a