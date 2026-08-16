# Phase 4 — Python ML Microservice — Step by Step

---

## Overview of Steps

```
Step 1 → Understand the microservice architecture
Step 2 → Setup Python project structure
Step 3 → Setup FastAPI server
Step 4 → Setup dependencies and environment
Step 5 → Build injury risk model
Step 6 → Build decision EV model
Step 7 → Build momentum Cox model
Step 8 → Build timeout optimizer
Step 9 → Build story mode generator
Step 10 → Build NFL data bridge
Step 11 → Setup health check and docs
Step 12 → Test all endpoints
```

---

## Step 1 — Understand the Microservice Architecture

**What this service is:**
```
A completely separate Python server
Runs independently on its own port
Node.js backend calls it via HTTP
Returns JSON results
Neither service knows how the other works internally
Clean separation
```

**Why Python for this:**
```
scikit-learn    → Best ML library available
lifelines       → Only good Cox hazard model library
scipy           → Statistical tests
numpy pandas    → Data science standard
All of these exist in Python
None have good Node equivalents
```

**How Node and Python communicate:**
```
Node.js (port 8000)
        │
        │ HTTP POST/GET requests
        │ JSON body
        ↓
Python FastAPI (port 8001)
        │
        │ Runs models
        │ Returns JSON
        ↓
Node.js receives result
stores in SQLite
returns to frontend
```

**When Node calls Python:**
```
Node calls Python for
├── Computing injury risk score for a player
├── Computing EV for a coaching decision
├── Running Cox model on play by play data
├── Computing momentum timeline for a game
├── Generating timeout recommendations
└── Generating story mode text

Node does NOT call Python for
├── Database reads and writes (Node handles that)
├── Caching (Node handles that)
├── API routing (Node handles that)
└── Data fetching from sports APIs (Node handles that)
```

---

## Step 2 — Setup Python Project Structure

**Where this lives:**
```
The python_ml folder already exists
from Phase 1 folder setup
Now we fill it
```

**Full structure:**
```
python_ml/
│
├── app/
│   ├── main.py                   → FastAPI entry point
│   ├── routers/
│   │   ├── injury.py             → Injury model routes
│   │   ├── decisions.py          → Decision EV routes
│   │   ├── momentum.py           → Momentum model routes
│   │   ├── timeout.py            → Timeout optimizer routes
│   │   ├── story.py              → Story generator routes
│   │   └── nfl_data.py           → NFL data bridge routes
│   │
│   ├── models/
│   │   ├── injury_model.py       → Z-score and risk logic
│   │   ├── decision_model.py     → EV and WP model logic
│   │   ├── momentum_model.py     → Cox hazard model logic
│   │   ├── timeout_model.py      → Timeout decision tree
│   │   └── story_model.py        → Story generation logic
│   │
│   ├── schemas/
│   │   ├── injury_schemas.py     → Pydantic input/output shapes
│   │   ├── decision_schemas.py
│   │   ├── momentum_schemas.py
│   │   ├── timeout_schemas.py
│   │   └── story_schemas.py
│   │
│   ├── data/
│   │   ├── nfl_bridge.py         → nfl_data_py wrapper
│   │   ├── model_cache.py        → Cache trained models in memory
│   │   └── sample_data/          → Sample data for testing
│   │       ├── sample_gamelogs.json
│   │       ├── sample_plays.json
│   │       └── sample_decisions.json
│   │
│   └── utils/
│       ├── stats_helpers.py      → Shared stat functions
│       ├── logger.py             → Python logger setup
│       └── validators.py         → Input validation helpers
│
├── tests/
│   ├── test_injury.py
│   ├── test_decisions.py
│   ├── test_momentum.py
│   └── test_timeout.py
│
├── .env
├── .env.example
├── requirements.txt
├── Procfile                      → For deployment
└── README.md
```

---

## Step 3 — Setup FastAPI Server

**What main.py does:**
```
Creates the FastAPI application instance
Registers all routers
Sets up CORS so Node.js can call it
Sets up middleware
Configures docs
Starts the server
```

**FastAPI app configuration:**
```
Title           → Apex ML Microservice
Description     → Statistical and ML models for Apex Sports Intelligence
Version         → 1.0.0
Docs URL        → /docs (Swagger auto generated)
Redoc URL       → /redoc (alternative docs)
```

**CORS setup:**
```
Allow origins
├── http://localhost:8000    → Node.js backend
└── http://localhost:3000    → Frontend (for direct calls if needed)

Allow methods   → GET, POST
Allow headers   → Content-Type, Authorization
```

**Routers registered:**
```
/injury      → injury router
/decisions   → decisions router
/momentum    → momentum router
/timeout     → timeout router
/story       → story router
/nfl         → nfl data bridge router
/health      → health check (inline in main.py)
```

**Startup events:**
```
On server start
├── Load any pre-trained model files from disk
├── Initialize model cache in memory
├── Log startup message with port
└── Warm up models with dummy data
    └── First call is always slow due to library loading
    └── Warmup makes real first call fast
```

---

## Step 4 — Dependencies and Environment

**requirements.txt — every package needed:**

```
Web Framework
├── fastapi               → The web framework
└── uvicorn               → ASGI server to run FastAPI

Data Science Core
├── pandas                → Data manipulation
├── numpy                 → Numerical operations
└── scipy                 → Statistical tests and functions

Machine Learning
├── scikit-learn          → Logistic regression, decision tree
└── lifelines             → Cox proportional hazard model

Sports Data
├── nfl-data-py           → NFL play by play data
└── pybaseball            → MLB Statcast data

Utilities
├── pydantic              → Data validation and schemas
├── python-dotenv         → Environment variable loading
├── httpx                 → Async HTTP client
├── joblib                → Save and load trained models
└── openai                → Optional story mode enhancement
```

**Python version:**
```
Python 3.10 or higher required
scikit-learn and lifelines need this minimum
```

**.env file for Python:**
```
PORT                → 8001
NODE_BACKEND_URL    → http://localhost:8000
ENVIRONMENT         → development
LOG_LEVEL           → debug
MODEL_CACHE_DIR     → ./model_cache/
OPENAI_API_KEY      → optional, leave blank
WP_MODEL_PATH       → ./model_cache/wp_model.joblib
DECISION_MODEL_PATH → ./model_cache/decision_model.joblib
```

**How to run:**
```
Development
└── uvicorn app.main:app --reload --port 8001

Production
└── uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 2
```

---

## Step 5 — Injury Risk Model

**File:** app/models/injury_model.py

**What this model does:**
```
Takes a player's game log history
Computes their personal baseline
Runs z-score analysis on recent window
Produces risk score and explanation
```

---

### Step 5.1 — Input Schema

**What Node.js sends to Python:**
```
POST /injury/compute-risk

Body contains
├── playerId        → string identifier
├── playerName      → for explanation text
├── sport           → "NBA" / "NFL" / "MLB"
├── gameLogs        → array of game log objects
│   Each log contains
│   ├── date
│   ├── minutesPlayed
│   ├── distanceCovered (if available)
│   ├── highIntensityEvents (if available)
│   ├── backToBack
│   └── daysRestBefore
└── windowDays      → default 7 (recent window)
    baselineDays    → default 21 (baseline window)
```

---

### Step 5.2 — Baseline Computation

**How the personal baseline is built:**
```
Take all game logs from last 21 days
For each metric (minutes, distance, intensity)
├── Compute the mean across all logs
└── Compute the standard deviation across all logs

This gives us
├── baselineMeanMinutes
├── baselineStdMinutes
├── baselineMeanDistance
├── baselineStdDistance
├── baselineMeanIntensity
└── baselineStdIntensity

Minimum data requirement
└── Need at least 5 games in baseline window
    If less than 5 games → return null risk
    Cannot compute reliable baseline with too little data
```

---

### Step 5.3 — Z-Score Analysis

**How z-scores are computed:**
```
For each metric in the recent 7 day window
Take the average value in that window

Z-score formula
└── (recent window average - baseline mean) / baseline std

Example
├── Player baseline minutes mean  → 28.5
├── Player baseline minutes std   → 3.2
├── Recent 7 day average minutes  → 36.1
└── Z-score = (36.1 - 28.5) / 3.2 = 2.375

Interpretation
├── Z-score > 1.5   → elevated (yellow zone)
├── Z-score > 2.0   → high (red zone)
└── Z-score < 1.5   → normal (green zone)
```

**What triggers a flag:**
```
Any single metric z-score above 1.5
OR
Back to back games in last 7 days
OR
More than 4 games in last 7 days
```

---

### Step 5.4 — Risk Score Computation

**How 0-100 score is calculated:**
```
Start with base score of 0

Minutes z-score contribution    → up to 40 points
├── z-score 1.5 to 2.0 → 20 to 30 points
└── z-score above 2.0  → 30 to 40 points

Distance z-score contribution   → up to 25 points
Same scale as minutes

Intensity z-score contribution  → up to 20 points
Same scale

Back to back penalty            → +10 points flat
High games in 7 days penalty    → +5 points per game over 3

Cap at 100 maximum

Final score buckets
├── 0 to 33    → green zone
├── 34 to 66   → yellow zone
└── 67 to 100  → red zone
```

---

### Step 5.5 — Explanation Generation

**Plain English explanation rules:**
```
Template system based on what triggered the flag

If minutes spike is the trigger
└── "{playerName} has played {X}% more minutes than
    their personal average over the last {N} games"

If back to back triggered
└── "{playerName} played back to back games on {dates}
    with only {hours} hours of rest"

If multiple metrics spiked
└── Combine both explanations with "and"

Risk zone prefix
├── Red    → "HIGH RISK: "
├── Yellow → "ELEVATED RISK: "
└── Green  → "Normal workload: "
```

---

### Step 5.6 — Output Schema

**What Python sends back to Node:**
```
Response contains
├── playerId
├── riskScore           → 0 to 100 float
├── zone                → "green" / "yellow" / "red"
├── triggerMetric       → "minutes" / "backToBack" / "intensity"
├── minutesZScore       → float
├── distanceZScore      → float or null
├── intensityZScore     → float or null
├── backToBackFlag      → boolean
├── baselineMeanMinutes → float
├── baselineStdMinutes  → float
├── explanation         → full plain English string
├── windowStart         → date
├── windowEnd           → date
└── dataPointsUsed      → number of games in baseline
```

---

## Step 6 — Decision EV Model

**File:** app/models/decision_model.py

**What this model does:**
```
Takes a game situation
Computes win probability
Calculates expected value of each available action
Determines if coach made optimal choice
```

---

### Step 6.1 — Win Probability Model

**How WP model is built:**
```
Model type → Logistic Regression via scikit-learn

Training features (inputs)
├── Score differential      → how many points up or down
├── Time remaining seconds  → how much game left
├── Home or away            → home field advantage
├── Down                    → 1st through 4th (NFL)
├── Field position          → yard line
├── Timeouts remaining      → both teams
└── Quarter or period       → game segment

Training target (output)
└── Did the home team win (1 or 0)

Training data
└── Historical game play by play
    Multiple seasons worth
    Each play is one training sample

Output
└── Probability between 0 and 1
    That the current team wins from this exact situation
```

**Model training process:**
```
Step 1 → Load historical play by play data
Step 2 → Engineer features from raw plays
Step 3 → Split into training and test sets (80/20)
Step 4 → Fit LogisticRegression on training set
Step 5 → Evaluate on test set
         Target accuracy above 65%
Step 6 → Save model to disk with joblib
         Loaded on startup, not retrained each time
```

**Model loading strategy:**
```
On Python service startup
├── Check if model file exists at WP_MODEL_PATH
├── If exists → load from disk (fast, under 1 second)
├── If not exists → train on available data (slow, minutes)
└── Store in memory for all subsequent calls
```

---

### Step 6.2 — EV Calculation

**How EV is calculated for each option:**

**NFL 4th Down Example:**
```
Situation
├── 4th and 2 from opponent 35 yard line
├── Down by 3 points
├── 4 minutes remaining
└── 2 timeouts available

Options available
├── Go for it
├── Punt
└── Field goal attempt

For each option
├── Estimate probability of success
│   ├── Go for it   → historical 4th and 2 conversion rate from this position
│   ├── Punt        → expected field position after punt
│   └── Field goal  → historical FG% from 52 yards
│
├── For each outcome of each option
│   ├── Run WP model with resulting game state
│   └── Get win probability for that outcome
│
└── EV of option = 
    (prob success × WP if success) + 
    (prob failure × WP if failure)

Best option → highest EV
Chosen option → what coach actually did
isOptimal → chosen option EV equals best option EV
```

**Historical success rates stored as:**
```
Lookup tables in the model
Not recomputed each time

4th down conversion rates
└── Bucketed by yards to go and field position
    e.g. 4th and 1 from own 30 → 68% conversion rate
    e.g. 4th and 5 from opp 20 → 41% conversion rate

Field goal success rates
└── Bucketed by distance
    e.g. 40 to 44 yards → 78% success rate
    e.g. 50 to 54 yards → 63% success rate

These tables are computed from historical data
Stored as Python dictionaries for fast lookup
```

---

### Step 6.3 — NBA Decision Types

**Late game shot selection:**
```
Input
├── Shot type (3pt, mid range, at rim)
├── Shooter quality (player's shooting percentage)
├── Time remaining
└── Score differential

EV calculation
├── Expected points from shot type × shooter quality
└── Compare to other available shot types
```

**Fouling when up 3:**
```
Input
├── Time remaining (under 10 seconds)
├── Opponent at free throw line

Analysis
├── Foul → opponent shoots 2 FTs (can't tie with 2)
├── Don't foul → opponent can attempt 3 pointer
└── Historical data shows don't foul is higher EV
    But many coaches still foul
    This is the insight the module surfaces
```

---

### Step 6.4 — Input and Output Schema

**Input from Node:**
```
POST /decisions/compute-ev

Body
├── sport           → "NFL" / "NBA" / "MLB"
├── decisionType    → "4th_down" / "timeout" / "2pt"
├── gameContext     → full situation object
│   ├── scoreDiff
│   ├── timeRemainingSeconds
│   ├── period
│   ├── down (NFL)
│   ├── yardsToGo (NFL)
│   ├── fieldPosition (NFL)
│   └── timeoutsRemaining
├── chosenAction    → what coach did
└── availableActions → list of options that were available
```

**Output to Node:**
```
Response
├── evChosen            → EV of what coach did
├── evBest              → EV of best available option
├── evDifference        → evBest minus evChosen
├── isOptimal           → boolean
├── winProbBefore       → WP before decision
├── allOptions          → array of all options with their EVs
│   Each option
│   ├── action
│   ├── ev
│   ├── probSuccess
│   └── wpIfSuccess
│       wpIfFailure
└── explanation         → plain English summary
```

---

## Step 7 — Momentum Cox Model

**File:** app/models/momentum_model.py

**What this model does:**
```
Takes play by play data for a season or game
Runs Cox proportional hazard model
Determines if momentum statistically exists
Produces game timeline momentum scores
```

---

### Step 7.1 — Understanding Cox Model for Momentum

**What the Cox model measures:**
```
Standard use → survival analysis (how long until death)
Our use      → time until opponent scores next

The question we ask
After team A scores N consecutive points
does the hazard rate (risk) of team B scoring next
change significantly?

If hazard coefficient is positive and significant
→ Consecutive scoring raises opponent's hazard
→ Momentum is real (leads to opponent scoring)

If coefficient is not significant (p > 0.05)
→ Consecutive scoring has no real effect
→ Momentum is a statistical myth in this sport
```

---

### Step 7.2 — Data Preparation for Cox Model

**What we need from play by play:**
```
For each scoring event in the dataset
├── Time since last score (duration)
├── Which team scored
├── How many consecutive scores that team had
│   before this event
├── Score differential at that moment
├── Game period
└── Whether opponent is next to score (event indicator)
```

**Building survival records:**
```
Each record represents
"After team A scored their Nth consecutive point
how long until someone scored next
and who scored it?"

Duration    → seconds between consecutive scores
Event       → 1 if opponent scored next, 0 if same team continued
Covariates  → consecutive scores, score diff, period, time remaining
```

---

### Step 7.3 — Running the Cox Model

**Using lifelines library:**
```
Model → CoxPHFitter from lifelines

Fit the model on survival records
Duration column    → time between scores
Event column       → did opponent score next
Covariate columns  → consecutive scores and context

After fitting
├── Get hazard ratio for consecutive scores covariate
├── Get p-value for that coefficient
├── Get confidence interval (95%)
└── Determine significance
```

**Interpreting results:**
```
Hazard coefficient of 0.08 means
→ Each additional consecutive score
  raises opponent hazard rate by 8%
→ After 3 consecutive scores
  opponent hazard raised by ~24%

If p-value > 0.05
→ This effect is not statistically significant
→ Could be random chance
→ "Momentum is a myth in this sport"

If p-value < 0.05
→ Effect is real
→ "Momentum has a measurable effect in this sport"
```

---

### Step 7.4 — Game Timeline Momentum Score

**How per-game momentum is computed:**
```
For each play in the game in sequence
Maintain a rolling state
├── homeConsecutiveScores  → resets when away scores
├── awayConsecutiveScores  → resets when home scores
├── timeSinceLastScore     → seconds counter

At each scoring event
├── Run Cox model predict on current state
│   Returns instantaneous hazard ratio
├── Home momentum score = homeConsecutiveScores
│   weighted by hazard ratio
└── Away momentum score = awayConsecutiveScores
    weighted by hazard ratio

Output → array of
├── gameTimeSeconds
├── homeMomentumScore
├── awayMomentumScore
└── eventDescription
```

---

### Step 7.5 — Input and Output Schema

**Input from Node:**
```
POST /momentum/compute-season
Body
├── sport       → sport string
├── season      → season string
└── plays       → array of play by play records
    Each play
    ├── gameId
    ├── eventTimeSeconds
    ├── teamId
    ├── isScoring
    ├── homeScore
    ├── awayScore
    └── period

POST /momentum/compute-game
Body
├── gameId
└── plays → same format as above but single game
```

**Output for season analysis:**
```
├── hazardCoefficient
├── pValue
├── confidenceIntervalLow
├── confidenceIntervalHigh
├── isSignificant
├── effectSize
├── gamesAnalyzed
├── playsAnalyzed
├── verdictLabel
├── plainExplanation
└── shortExplanation
```

**Output for game timeline:**
```
├── gameId
├── homeTeamMomentum    → array of score over time
├── awayTeamMomentum    → array of score over time
├── timelineEvents      → full event array with momentum
├── peakHomeMomentum
├── peakAwayMomentum
├── momentumShifts
└── longestStreak
```

---

## Step 8 — Timeout Optimizer

**File:** app/models/timeout_model.py

**What this model does:**
```
Takes current game situation
Predicts whether calling timeout improves stop probability
Returns recommendation with confidence
```

---

### Step 8.1 — How the Model Works

**Model type:**
```
Decision Tree Classifier via scikit-learn

Why decision tree
├── Interpretable → can explain exactly why recommendation made
├── Fast prediction → instant results
└── Works well with categorical game situations
```

**Training data:**
```
Historical timeout situations from play by play
Each record is a timeout call moment with
├── Consecutive opponent scores before timeout
├── Score differential
├── Time remaining
├── Period
├── Timeouts available
└── Did the defense get a stop on the next possession (target)

Also include no-timeout situations
where defense either got stop or didn't
This gives us the counterfactual comparison
```

**Features:**
```
consecutiveScores   → 1, 2, 3, 4, 5+
scoreDiff           → bucketed ranges
timeRemaining       → bucketed ranges
period              → 1, 2, 3, 4, OT
timeoutsAvailable   → 1, 2, 3
```

---

### Step 8.2 — Scenario Pre-computation

**Why we pre-compute:**
```
There are a finite number of meaningful scenarios
Rather than computing live each request
We compute all scenarios once
Store in TimeoutRecommendations table via Node
Node serves them instantly

Total scenarios
├── consecutiveScores  → 5 levels
├── scoreDiff          → 6 buckets
├── timeRemaining      → 5 buckets
├── period             → 5 levels (1-4 + OT)
└── timeoutsAvailable  → 3 levels

5 × 6 × 5 × 5 × 3 = 2250 scenarios per sport
Very manageable
```

**Input for batch pre-computation:**
```
POST /timeout/precompute
Body
└── sport → "NFL" / "NBA"

Returns array of 2250 scenario recommendations
Node writes all to TimeoutRecommendations table
```

---

## Step 9 — Story Mode Generator

**File:** app/models/story_model.py

**What this does:**
```
Takes current analytics data
Generates readable narrative paragraph
Adapts tone and complexity to role
Returns plain English summary
```

---

### Step 9.1 — Template System

**Templates per module per role:**

**Injury module — Trainer role:**
```
Template
"{playerName} is currently showing {zone} risk
with a score of {riskScore}/100.
{triggerMetric} spiked {percentageAbove}% above
their personal baseline over the last {windowDays} days.
{recommendationText}"

recommendationText rules
├── Red zone    → "Consider reducing minutes or rest day"
├── Yellow zone → "Monitor closely over next 3 games"
└── Green zone  → "Workload within normal range"
```

**Injury module — Fan role:**
```
Simpler template
"{playerName} has been playing more than usual lately.
Our system rates their injury risk at {riskScore} out of 100
which is considered {zone} risk."
```

**Decision module — Coach role:**
```
"{coachName} has made the statistically optimal decision
{evRate}% of the time this season,
ranking {rank} out of {totalCoaches} coaches in the {sport}.
Their best decision came in {bestGameDate}
where they correctly {bestDecisionDesc}."
```

**Momentum module — Analyst role:**
```
"In the {sport}, our Cox proportional hazard model
analyzed {gamesAnalyzed} games from the {season} season.
The results show that momentum is {verdictLabel}.
A streak of consecutive scores changes the opponent's
scoring hazard rate by {hazardRateChange}%
(p={pValue}, {significanceText})."
```

---

### Step 9.2 — Optional OpenAI Enhancement

**When OpenAI key is available:**
```
Use templates to build a structured prompt
Send to GPT-3.5-turbo (cheapest model)
Get richer more natural sounding text back

Prompt structure
├── System message → "You are a sports analytics commentator"
├── Data context   → all the metrics as structured data
├── Role context   → who is reading this
└── Instruction    → "Write a 2-3 sentence analysis"

Fallback behavior
└── If OpenAI call fails or key not set
    Use template system
    Never fail the request because of AI
```

**Cost control:**
```
Only call OpenAI when
├── Key is present in environment
├── Story has not been recently generated
└── Role is analyst or journalist

Never call for fan role (too many requests)
Cache all generated stories for 1 hour
```

---

### Step 9.3 — Input and Output Schema

**Input from Node:**
```
POST /story/generate
Body
├── module      → "injury" / "decisions" / "momentum"
├── sport       → sport string
├── role        → "trainer" / "coach" / "analyst" / "fan"
├── entityId    → player or coach identifier
├── entityName  → human readable name
└── metrics     → object with all relevant numbers
```

**Output:**
```
├── storyText       → full paragraph
├── headlineText    → one line headline
├── toneLabel       → "warning" / "positive" / "neutral"
├── generatedBy     → "template" / "openai"
└── keyMetrics      → echo back the metrics used
```

---

## Step 10 — NFL Data Bridge

**File:** app/data/nfl_bridge.py and router app/routers/nfl_data.py

**What this does:**
```
nfl_data_py is a Python library
Node cannot call it directly
This bridge exposes it as HTTP endpoints
Node calls these endpoints to get NFL data
```

**Endpoints:**

**GET /nfl/plays:**
```
Parameters
├── season  → year
├── week    → optional
└── team    → optional team abbreviation

Internally calls nfl_data_py
Returns cleaned play by play array
```

**GET /nfl/rosters:**
```
Parameters
└── season → year

Returns all player roster data
```

**GET /nfl/schedules:**
```
Parameters
└── season → year

Returns full season schedule
```

**Data cleaning done here:**
```
nfl_data_py returns pandas DataFrames
Convert to list of dicts
Handle null values (replace with None not NaN)
NaN is not valid JSON, None becomes null
This is critical
```

---

## Step 11 — Health Check and Docs

**Health endpoint:**
```
GET /health

Returns
├── status          → "ok"
├── environment     → development or production
├── models
│   ├── wpModel         → "loaded" / "not loaded"
│   ├── decisionModel   → "loaded" / "not loaded"
│   ├── momentumModel   → "loaded" / "not loaded"
│   └── timeoutModel    → "loaded" / "not loaded"
├── nflDataAvailable → boolean
└── timestamp
```

**Swagger docs:**
```
Auto generated at /docs
Every endpoint documented via Pydantic schemas
Judges can explore without Postman
Very impressive in demos
```

---

## Step 12 — Testing All Endpoints

**Test 1 — Injury Risk:**
```
Send 21 sample game logs for a player
Verify risk score between 0 and 100
Verify zone is green yellow or red
Verify explanation text is readable
Test with less than 5 games → should handle gracefully
Test with all same minutes → z-score should be 0
```

**Test 2 — Decision EV:**
```
Send a 4th and 1 from opponent 30 scenario
Verify go for it has highest EV
Send a 4th and 15 from own 20
Verify punt or field goal has higher EV
Verify isOptimal correctly set
Test all three NFL decision types
```

**Test 3 — Cox Momentum Model:**
```
Send sample play by play for 100 games
Verify model runs without error
Verify output has all required fields
Verify p-value between 0 and 1
Verify plain explanation generated
Test with single game for timeline
Verify timeline has entry for each scoring event
```

**Test 4 — Timeout Optimizer:**
```
Request precompute for NBA
Verify 2250 scenarios returned
Check a specific scenario
3 consecutive opponent scores
Down by 2
2 minutes remaining
4th quarter
Verify recommendation makes intuitive sense
```

**Test 5 — Story Generator:**
```
Send injury data for trainer role
Verify plain English output
Send same data for fan role
Verify simpler language
Test with OpenAI key → richer output
Test without key → template fallback
```

**Test 6 — NFL Bridge:**
```
Call /nfl/plays for 2023 season week 1
Verify data returns
Verify no NaN values in response
Verify 4th down plays identifiable
```

**Test 7 — Node to Python Integration:**
```
Start both servers
From Node.js call Python health endpoint
Verify Node receives 200 response
Call injury compute from Node
Verify full round trip works
Check logs on both sides
```

---

## Phase 4 Full Summary

| Step | What It Builds | Key Output |
|---|---|---|
| Step 1 | Architecture understanding | Communication pattern clear |
| Step 2 | Project structure | All folders and files |
| Step 3 | FastAPI server | Running Python server |
| Step 4 | Dependencies and env | All packages installed |
| Step 5 | Injury risk model | Z-score risk computation |
| Step 6 | Decision EV model | WP model and EV calculation |
| Step 7 | Cox momentum model | Statistical momentum analysis |
| Step 8 | Timeout optimizer | Pre-computed recommendations |
| Step 9 | Story generator | Plain English narratives |
| Step 10 | NFL data bridge | nfl_data_py accessible |
| Step 11 | Health and docs | Swagger UI working |
| Step 12 | Testing | All endpoints verified |

---

## What Phase 4 Delivers

```
After Phase 4 is complete

Python service running on port 8001
├── Injury risk computed for any player given game logs
├── EV calculated for any coaching decision
├── Cox model runnable on any play by play dataset
├── Timeout recommendations pre-computed
├── Story text generated for any module and role
└── NFL play by play accessible via HTTP

Node.js backend can now
├── Send player logs → get back risk score
├── Send game context → get back EV analysis
├── Send play by play → get back momentum analysis
└── Send metrics → get back readable story

Phase 5 (API Routes) can now
└── Wire everything together into
    clean endpoints the frontend calls
```

**Phase 4 is the brain of the entire platform**
**Everything intelligent happens here**
**Phase 5 just connects the brain to the outside world**