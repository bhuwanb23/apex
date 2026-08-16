# Phase 8 — Error Handling and Logging — Step by Step

---

## Overview of Steps

```
Step 1 → Understand error handling philosophy
Step 2 → Build custom error classes
Step 3 → Build global error middleware (8.1)
Step 4 → Build specific error handlers
Step 5 → Build request validation layer
Step 6 → Build Winston logger setup (8.2)
Step 7 → Build request logging
Step 8 → Build ML call logging
Step 9 → Build data fetch logging
Step 10 → Build error tracking and reporting
Step 11 → Build log management
Step 12 → Test everything
```

---

## Step 1 — Understand Error Handling Philosophy

**The core principle:**
```
The app should NEVER crash because of bad data
The app should NEVER expose internal details to users
The app should ALWAYS return something useful
Even when things go wrong
```

**Three levels of errors:**
```
Level 1 — Expected errors (handle gracefully)
├── Player not found → 404 with clear message
├── Invalid sport param → 400 with what was wrong
├── ML service down → return cached data with warning
└── Sports API rate limit → retry with backoff

Level 2 — Degraded service errors (serve partial)
├── DB query fails → return cached response if available
├── Python model fails → return last known score from DB
├── Data sync fails → app still serves stale data
└── One sport API down → other sports still work

Level 3 — Unknown errors (safe response + full log)
├── Unexpected exception → 500 with safe generic message
├── Never expose stack traces to client
├── Log everything internally
└── App continues running
```

**Error response guarantee:**
```
Every single error returns
├── success: false
├── status: HTTP code
├── message: human readable safe message
├── errorCode: machine readable string
└── timestamp: when error occurred

Never returns
├── Stack traces
├── SQL queries
├── File paths
├── Internal variable names
└── Raw error objects
```

---

## Step 2 — Build Custom Error Classes

**File:** src/utils/errors.ts

**Why custom error classes:**
```
JavaScript's built in Error class has limited info
We need errors that carry
├── HTTP status code
├── Error code string (for frontend to handle programmatically)
├── Whether to expose message to client
└── Additional context data
```

---

### Step 2.1 — Base Application Error

**AppError class extends Error:**
```
Properties
├── message      → human readable description
├── statusCode   → HTTP status code (400, 404, 500 etc)
├── errorCode    → machine readable string code
├── isOperational → boolean
│   true  → expected error, log as warning
│   false → unexpected error, log as critical
├── context      → optional extra data for logging
└── timestamp    → when error was created

isOperational distinction is critical
├── Operational errors (true)
│   → Bad user input, resource not found
│   → Log as warning level
│   → App is working correctly
└── Programmer errors (false)
    → Unexpected exceptions, bugs
    → Log as error level
    → May need developer attention
```

---

### Step 2.2 — Specific Error Classes

**All extend AppError:**

**ValidationError:**
```
Status code  → 400
Error code   → "VALIDATION_ERROR"
isOperational → true
Use for      → Bad request parameters
               Invalid sport name
               Missing required fields
               Invalid player ID format

Extra field
└── validationErrors → array of field level errors
    Each contains
    ├── field   → which field failed
    ├── message → what was wrong
    └── value   → what was provided
```

**NotFoundError:**
```
Status code  → 404
Error code   → "NOT_FOUND"
isOperational → true
Use for      → Player not found
               Team not found
               Game not found

Extra field
└── resource → what type of resource was not found
```

**MLServiceError:**
```
Status code  → 503
Error code   → "ML_SERVICE_ERROR"
isOperational → true
Use for      → Python service returned error response

Extra fields
├── mlEndpoint    → which Python endpoint failed
├── mlStatusCode  → what Python returned
└── fallbackUsed  → boolean, did we serve cached data
```

**MLServiceUnavailableError:**
```
Status code  → 503
Error code   → "ML_SERVICE_UNAVAILABLE"
isOperational → true
Use for      → Cannot connect to Python service at all

Extra fields
├── lastAvailableAt → when Python was last healthy
└── fallbackUsed    → boolean
```

**DatabaseError:**
```
Status code  → 500
Error code   → "DATABASE_ERROR"
isOperational → false
Use for      → Prisma errors, SQLite errors

Extra fields
├── operation → what DB operation failed
└── table     → which table was involved
Note → never expose actual SQL in message
```

**ExternalAPIError:**
```
Status code  → 502
Error code   → "EXTERNAL_API_ERROR"
isOperational → true
Use for      → Sports API failures
               BallDontLie down
               ESPN API down

Extra fields
├── apiName      → which external API failed
├── apiStatus    → what status code they returned
└── retryAfter   → seconds until retry allowed
```

**RateLimitError:**
```
Status code  → 429
Error code   → "RATE_LIMIT_EXCEEDED"
isOperational → true
Use for      → Client hitting our API too fast

Extra fields
├── retryAfter → seconds until they can retry
└── limit      → what the limit is
```

**CacheError:**
```
Status code  → 500
Error code   → "CACHE_ERROR"
isOperational → false
Use for      → node-cache or SQLite cache failures
Note         → Usually silent, fall through to fresh compute
```

**AuthorizationError:**
```
Status code  → 401
Error code   → "UNAUTHORIZED"
isOperational → true
Use for      → Missing or invalid admin key
               On protected routes like job trigger
```

---

## Step 3 — Build Global Error Middleware (8.1)

**File:** src/middleware/error.middleware.ts

**What this middleware does:**
```
Catches ALL errors that reach it
Express automatically routes errors here
When any route calls next(error)
or throws inside async handler
This middleware handles it

Must be registered LAST in app.ts
After all routes
```

---

### Step 3.1 — Error Middleware Function

**Four parameters (Express error middleware signature):**
```
(err, req, res, next)
The four parameter signature is what tells
Express this is an error handler not a regular middleware
```

**Processing flow:**
```
Receive error object

Step 1 — Classify the error
├── Is it our custom AppError? → Use its properties
├── Is it a Prisma error? → Convert to DatabaseError
├── Is it an Axios error? → Convert to ExternalAPIError
└── Unknown type → Convert to generic 500 error

Step 2 — Log the error
├── Operational errors → log as warning
└── Non-operational → log as error with full stack

Step 3 — Build safe response
├── Never include stack trace in production
├── Use safe message for non-operational errors
│   "An internal error occurred"
│   Not the actual error message
└── Always include errorCode and timestamp

Step 4 — Send response
└── res.status(statusCode).json(errorResponse)
```

---

### Step 3.2 — Prisma Error Conversion

**Prisma throws specific error types:**
```
PrismaClientKnownRequestError
├── P2002 → Unique constraint violation
│   Convert to ValidationError "Already exists"
├── P2025 → Record not found
│   Convert to NotFoundError
└── P2003 → Foreign key constraint
    Convert to ValidationError "Invalid reference"

PrismaClientUnknownRequestError
└── Convert to DatabaseError
    Log full error internally

PrismaClientInitializationError
└── Critical — DB cannot connect
    Convert to DatabaseError
    Log as critical level
    This needs immediate attention
```

---

### Step 3.3 — Axios Error Conversion

**When sports API calls fail:**
```
AxiosError with response
├── Status 429 → ExternalAPIError with retryAfter
├── Status 401 → Log API key issue internally
│               Return generic ExternalAPIError to client
├── Status 503 → ExternalAPIError, API is down
└── Status 5xx → ExternalAPIError with apiStatus

AxiosError without response (network error)
└── ExternalAPIError with message "API unreachable"
    This means our server cannot reach the sports API
```

---

### Step 3.4 — Async Error Wrapper

**The problem with async routes:**
```
Express does not automatically catch
rejected promises in async route handlers

Without wrapper
async (req, res) => {
  throw new Error("oops")  // Express never catches this!
}

With wrapper
Every async controller wrapped so
rejected promises call next(error)
```

**asyncHandler utility function:**
```
Wraps any async function
Returns new function that catches rejections
Calls next(error) on any rejection

Usage
router.get("/players", asyncHandler(controller.getPlayers))

No more try-catch boilerplate in every controller
asyncHandler handles it centrally
```

---

## Step 4 — Build Specific Error Handlers

**File:** src/middleware/fallback.handlers.ts

**These handle specific degraded service scenarios**

---

### Step 4.1 — ML Service Fallback Handler

**What it does:**
```
When Python ML service is unavailable
Instead of returning an error
Return the last known computed data from SQLite

This is the most important fallback
Judges might demo when Python is not running
App should still show something useful
```

**handleMLFallback(playerId, module):**
```
Called when MLServiceUnavailableError is caught
in injury, decisions, or momentum services

For injury module
├── Query InjuryRiskScores for this player
│   Get most recent record (isLatest = true)
├── If record exists
│   Return it with extra field
│   staleSince → when it was computed
│   warning → "ML service unavailable, showing last known score"
└── If no record exists
    Return null risk with explanation
    "No risk data available, ML service offline"

For decisions module
├── Query DecisionEVScores from SQLite
└── Return last computed leaderboard

For momentum module
├── Query MomentumAnalysis from SQLite
└── Return last computed season analysis
```

**Response when fallback used:**
```
Normal response shape PLUS
├── _cached: true
├── _cachedAt: timestamp of when data was computed
├── _warning: "ML service currently unavailable.
              Showing data from last successful computation."
└── _staleSince: how many hours ago
```

---

### Step 4.2 — External API Fallback Handler

**What it does:**
```
When sports API (BallDontLie, ESPN etc) fails
Return data from SQLite instead
We already synced data into DB periodically
Serve that even if API is currently down
```

**handleAPIFallback(sport, dataType):**
```
Called when ExternalAPIError caught in fetchers

For player data
└── Query Players table from SQLite
    Return what we have

For game data
└── Query Games table
    Return games we already stored

For game logs
└── Query PlayerGameLogs
    Return stored logs

Add warning to response
"Live data unavailable. Showing last synced data from {cachedAt}"
```

---

### Step 4.3 — Database Fallback Handler

**What it does:**
```
When SQLite query fails
Try to serve from memory cache
If not in memory cache
Return graceful error message
```

**handleDBFallback(cacheKey, errorContext):**
```
Step 1 → Check memory cache for this key
├── Found → return with warning "database temporarily unavailable"
└── Not found → return structured error response
    "Data temporarily unavailable, please try again shortly"
    Log the DB error at critical level
    This needs immediate attention
```

---

### Step 4.4 — 404 Handler

**For routes that don't exist:**
```
Registered after all valid routes
Before the error middleware

Returns
├── success: false
├── status: 404
├── message: "Route not found"
├── errorCode: "ROUTE_NOT_FOUND"
└── suggestion: "See /api/docs for available endpoints"

Why include suggestion
→ Points judge to Swagger docs
→ Helpful instead of cryptic
```

---

## Step 5 — Build Request Validation Layer

**File:** src/middleware/validation.middleware.ts

**What this does:**
```
Validates all incoming request parameters
Before they reach controllers
Using Zod schemas for type-safe validation
```

---

### Step 5.1 — Validation Schemas

**Sport parameter schema:**
```
Must be one of "NBA" / "NFL" / "MLB" / "NHL"
Case insensitive on input
Normalized to uppercase
If invalid → ValidationError with
"sport must be one of: NBA, NFL, MLB, NHL"
```

**Player ID schema:**
```
Must be positive integer
Coerced from string (URL params are strings)
If NaN or negative → ValidationError
"playerId must be a positive integer"
```

**Season schema:**
```
Must match pattern like "2024" or "2024-25"
Regex validation
If invalid → ValidationError
"season format must be YYYY or YYYY-YY"
```

**Pagination schema:**
```
page  → positive integer, default 1
limit → positive integer, default 20, max 100
If limit > 100 → clamp to 100 with warning
```

**Date range schema:**
```
startDate and endDate
Must be valid ISO date strings
startDate must be before endDate
Maximum range → 365 days
```

**Timeout situation schema:**
```
consecutiveScores   → integer 1 to 10
scoreDiff           → integer -50 to 50
timeRemaining       → positive float
period              → integer 1 to 5
timeoutsAvailable   → integer 0 to 3
All required for timeout optimizer route
```

---

### Step 5.2 — Validation Middleware Factory

**createValidator(schema, source):**
```
Factory function returns Express middleware
source is "body" / "query" / "params"

Middleware
├── Extracts data from req[source]
├── Runs Zod parse on it
├── If valid → attaches cleaned data to req
│             req.validatedQuery or req.validatedBody
└── If invalid → throws ValidationError
                 with detailed field errors
```

**Why attach cleaned data:**
```
Zod can coerce and transform values
"1" → 1 (string to number)
"NBA" → "NBA" (normalized)
Controllers read from req.validatedQuery
not req.query
So they always get clean typed data
No type checking needed in controllers
```

---

## Step 6 — Build Winston Logger Setup (8.2)

**File:** src/utils/logger.ts

**Winston configuration:**
```
Winston is the industry standard Node.js logger
Much more powerful than console.log
├── Multiple transports (where logs go)
├── Log levels with filtering
├── Structured JSON logging
├── File rotation
└── Colorized console output
```

---

### Step 6.1 — Log Levels

**Our custom log level hierarchy:**
```
Levels from highest to lowest priority
├── critical  → 0  → App breaking issues (DB down, crash)
├── error     → 1  → Errors needing attention
├── warn      → 2  → Degraded service, retries, fallbacks
├── info      → 3  → Normal operations, job starts/ends
├── http      → 4  → All HTTP requests
├── debug     → 5  → Detailed development information
└── silly     → 6  → Very verbose, disabled in production

In production → log critical, error, warn, info, http
In development → log everything (all levels)
```

---

### Step 6.2 — Log Format

**Console format (development):**
```
Colorized and human readable
Example output

[2024-01-15 14:23:45] INFO: Server started on port 8000
[2024-01-15 14:23:46] HTTP: GET /api/injury/player/1 200 45ms
[2024-01-15 14:23:47] WARN: ML service fallback used for player 1
[2024-01-15 14:23:48] DEBUG: Cache hit for key "risk:1"

Colors per level
├── critical → red bold
├── error    → red
├── warn     → yellow
├── info     → green
├── http     → cyan
└── debug    → gray
```

**File format (both environments):**
```
Structured JSON for log aggregation
Each log entry is one JSON object

{
  "timestamp": "2024-01-15T14:23:45.123Z",
  "level": "info",
  "message": "Server started",
  "service": "Apex-backend",
  "environment": "production",
  "pid": 12345,
  "data": { any extra context }
}

JSON format allows
├── Searching logs with grep and jq
├── Feeding into log aggregators
└── Parsing programmatically
```

---

### Step 6.3 — Winston Transports

**Console transport:**
```
Active in all environments
Development → colorized format
Production  → simple format (less noise)
Level filter → LOG_LEVEL from environment
```

**Error log file transport:**
```
File → logs/error.log
Level → error and critical only
Format → JSON
Options
├── maxsize     → 20MB per file
├── maxFiles    → 10 (keep last 10 files)
├── tailable    → true (latest is always error.log)
└── zippedArchive → true (compress old files)
```

**Combined log file transport:**
```
File → logs/combined.log
Level → all levels (filtered by LOG_LEVEL)
Format → JSON
Same options as error log
```

**HTTP log file transport:**
```
File → logs/http.log
Level → http only
Separate file for request logs
Easy to analyze traffic separately
```

**Exception handler:**
```
Winston can catch unhandled exceptions
Logs them to logs/exceptions.log
Before the process crashes
Gives us the stack trace for debugging
```

**Rejection handler:**
```
Catches unhandled Promise rejections
Logs to logs/rejections.log
Same as exception handler but for promises
```

---

### Step 6.4 — Logger Singleton

**How the logger is used:**
```
Created once in logger.ts
Exported as singleton
Every file imports the same instance

import logger from "../utils/logger"

logger.info("Something happened")
logger.error("Something broke", { context })
logger.debug("Detailed info", { data })
logger.warn("Something suspicious", { details })

Second argument is always an object
with additional context data
Stored in the "data" field of JSON log
```

**Child loggers:**
```
Create child loggers for specific contexts
Each child inherits parent config
But adds default metadata

const jobLogger = logger.child({ context: "jobs" })
const mlLogger = logger.child({ context: "ml-client" })
const dbLogger = logger.child({ context: "database" })

Every log from jobLogger automatically includes
{ "context": "jobs" } in the JSON
Easy to filter all job logs
```

---

## Step 7 — Build Request Logging

**File:** src/middleware/request.logger.ts

**What this logs for every HTTP request:**

---

### Step 7.1 — Incoming Request Log

**Logged when request arrives:**
```
Log level → http

Fields logged
├── method      → GET POST DELETE etc
├── url         → full request URL
├── path        → just the path without query string
├── query       → query parameters object
├── userAgent   → browser or client info
├── ip          → client IP address
├── requestId   → unique ID generated for this request
└── timestamp   → when request arrived
```

**Request ID generation:**
```
Each request gets a unique UUID
Attached to req.requestId
Logged on both request and response
Lets you match request and response in logs
Critical for debugging specific requests
```

---

### Step 7.2 — Response Completion Log

**Logged when response is sent:**
```
Log level → http (2xx and 3xx)
Log level → warn (4xx)
Log level → error (5xx)

Fields logged
├── method          → same as request
├── url             → same as request
├── statusCode      → what we returned
├── responseTimeMs  → milliseconds to complete
├── requestId       → same UUID as request log
├── cacheStatus     → HIT / MISS / STALE
├── responseSize    → bytes in response body
└── timestamp       → when response sent
```

**Response time calculation:**
```
Record process.hrtime() on request arrival
Calculate difference when response sent
Convert to milliseconds with 2 decimal places
Attach to response header X-Response-Time
Log in completion log
```

---

### Step 7.3 — Slow Request Warning

**Automatic slow request detection:**
```
If responseTimeMs > 2000 (2 seconds)
Log at warn level with message "Slow request detected"
Include all normal fields plus
└── slowThresholdMs → what threshold was exceeded

Helps identify performance problems
When a route consistently shows slow
it needs investigation
```

---

### Step 7.4 — Request Context Propagation

**What request context is:**
```
Data that should follow a request through all layers
├── requestId     → unique identifier
├── sport         → which sport was requested
├── userId        → if auth added later
└── startTime     → for timing calculations

Attached to req object on arrival
All service and controller functions
receive req and can log with context
This links logs from the same request
```

---

## Step 8 — Build ML Call Logging

**File:** src/ml/ml.logger.ts

**Every call to Python ML service is logged**

---

### Step 8.1 — ML Request Log

**Logged before every Python call:**
```
Log level → debug

Fields
├── mlEndpoint    → which Python route called
├── sport         → context
├── payloadSize   → bytes in request body
├── requestId     → links to parent HTTP request
└── timestamp
```

---

### Step 8.2 — ML Response Log

**Logged after Python responds:**
```
Log level → debug (success)
Log level → warn  (ML error but handled)
Log level → error (ML unavailable)

Fields on success
├── mlEndpoint      → which endpoint
├── responseTimeMs  → how long Python took
├── responseSize    → bytes returned
├── modelUsed       → which model ran (from response)
└── requestId

Fields on failure
├── mlEndpoint
├── errorType       → connection refused, timeout, 500
├── errorMessage    → what Python said
├── fallbackUsed    → did we serve DB data instead
├── requestId
└── stackTrace      → only in development
```

---

### Step 8.3 — ML Performance Tracking

**Track ML response times over time:**
```
Keep a rolling array in memory
Last 100 ML response times per endpoint

Provides
├── Average ML response time per endpoint
├── P95 response time (95th percentile)
└── Slowest recent calls

Exposed via GET /api/jobs/ml-health
Judges can see ML performance metrics
```

---

### Step 8.4 — ML Timeout Logging

**When Python call times out:**
```
Log level → warn

Timeout threshold → 30 seconds (set in ml.client.ts)
When exceeded
├── Log timeout warning with endpoint and duration
├── Increment timeout counter per endpoint
├── If 3 consecutive timeouts for same endpoint
│   Log error level
│   "ML endpoint appears stuck"
└── Mark ML service health as degraded
    Not fully down but struggling
```

---

## Step 9 — Build Data Fetch Logging

**File:** src/data/fetch.logger.ts

**Every external sports API call is logged**

---

### Step 9.1 — Fetch Start Log

**Logged before every sports API call:**
```
Log level → debug

Fields
├── apiName       → "BallDontLie" / "ESPN" / "MLBStats"
├── endpoint      → which API endpoint called
├── params        → query parameters sent
├── cacheCheck    → was cache checked first
├── cacheResult   → "hit" / "miss" / "skipped"
└── timestamp
```

---

### Step 9.2 — Fetch Success Log

**Logged after successful API response:**
```
Log level → info

Fields
├── apiName
├── endpoint
├── responseTimeMs  → how long API took to respond
├── recordCount     → how many records returned
├── pageCount       → if paginated, how many pages
└── cacheUpdated    → was cache updated after fetch
```

---

### Step 9.3 — Fetch Failure Log

**Logged when API call fails:**
```
Log level → warn (retryable errors)
Log level → error (non-retryable)

Fields
├── apiName
├── endpoint
├── errorType     → "rate_limit" / "network" / "timeout" / "server"
├── statusCode    → if API responded with error
├── retryAttempt  → which retry this was (1, 2, 3)
├── retryIn       → seconds until next retry
└── willRetry     → boolean
```

---

### Step 9.4 — Sync Operation Log

**Logged at info level during data sync:**
```
Sync start
├── sport being synced
├── what sections will be synced
└── triggeredBy

Per section completion
├── section name (teams, players, games etc)
├── recordCount
├── duration
└── upsertCount vs skipCount

Sync completion
├── sport
├── totalDuration
├── recordsProcessed
├── errors encountered
└── nextSyncAt
```

---

## Step 10 — Build Error Tracking and Reporting

**File:** src/utils/error.tracker.ts

**What this does:**
```
Keeps running counts of errors
Not just logging individual errors
Tracking patterns
```

---

### Step 10.1 — Error Counter

**In-memory error tracking:**
```
Track per error type per hour
├── validationErrors      → bad client requests
├── notFoundErrors        → resources not found
├── mlServiceErrors       → Python failures
├── externalAPIErrors     → sports API failures
├── databaseErrors        → SQLite failures
└── unknownErrors         → unexpected exceptions

Every error increments the appropriate counter
Counters reset each hour
```

**Error rate calculation:**
```
Errors per minute = counter / 60
If errors per minute exceeds threshold
├── ValidationErrors > 50/min → likely abuse or bug
├── MLServiceErrors  > 5/min  → Python service issue
├── DatabaseErrors   > 1/min  → Critical DB problem
└── Log at critical level when thresholds exceeded
```

---

### Step 10.2 — Error Summary Route

**Route — GET /api/health/errors:**
```
Returns current error counts and rates

Response
├── period        → "last 1 hour"
├── counts
│   ├── validationErrors
│   ├── notFoundErrors
│   ├── mlServiceErrors
│   ├── externalAPIErrors
│   ├── databaseErrors
│   └── unknownErrors
├── rates
│   └── errorsPerMinute per type
├── recentErrors  → last 5 errors with details
└── status        → "healthy" / "degraded" / "critical"
```

---

## Step 11 — Build Log Management

**File:** src/utils/log.manager.ts

**What this handles:**
```
Log files can grow large over time
Need automatic management
```

---

### Step 11.1 — Log File Rotation

**Already handled by Winston transports:**
```
maxsize    → 20MB (rotate when file reaches this)
maxFiles   → 10 (keep 10 rotated files)
zippedArchive → compress old files to save space

Rotation naming
├── combined.log         → current
├── combined.log.1       → previous
├── combined.log.2.gz    → compressed older
└── ... up to 10 files
```

---

### Step 11.2 — Log Viewer Route

**Route — GET /api/logs/recent:**
```
Protected by X-Admin-Key header

Query parameters
├── level   → filter by log level
├── context → filter by context (jobs, ml, etc)
├── limit   → number of lines, default 50
└── since   → ISO timestamp, logs after this time

Reads from combined.log file
Parses JSON lines
Applies filters
Returns matching log entries

Useful during demo
├── Can show logs live in Postman
└── Proves the system is working
```

---

### Step 11.3 — Startup Log

**Logged when server starts:**
```
Log level → info

═══════════════════════════════════════
  Apex Sports Intelligence Backend
  Version: 1.0.0
  Environment: development
  Port: 8000
  Database: ./prisma/aqx.db
  ML Service: http://localhost:8001
  Node Version: 18.x
  Started at: 2024-01-15T14:00:00.000Z
═══════════════════════════════════════

Registered Routes
├── GET  /api/health
├── GET  /api/injury/player/:playerId
├── GET  /api/injury/team/:teamId
... all routes listed

Scheduled Jobs
├── Data Sync    → every 6 hours
├── Risk Compute → every 6 hours offset
├── Momentum     → daily at 2 AM
└── Cleanup      → daily at 3 AM

Cache Status
├── Memory cache → initialized
└── SQLite cache → 0 entries loaded

Ready to accept requests
═══════════════════════════════════════
```

---

## Step 12 — Test Everything

---

**Test 1 — Custom Error Classes:**
```
□ Throw ValidationError from a route
  Manually add throw new ValidationError(...)
  to a controller temporarily

□ Verify response shape
  success: false
  status: 400
  errorCode: "VALIDATION_ERROR"
  message: human readable
  validationErrors: array of field errors

□ Verify no stack trace in response

□ Check logs
  Should be warn level
  Should include context data
```

---

**Test 2 — Global Error Middleware:**
```
□ Throw unhandled error from a route
  throw new Error("unexpected")

□ Verify response is 500 with safe message
  "An internal error occurred"
  NOT the actual error message

□ Check error.log file
  Full error with stack trace logged

□ Verify app still accepts requests
  Make another request immediately
  Should work normally
  Error did not crash the server
```

---

**Test 3 — ML Service Fallback:**
```
□ Stop Python ML service

□ Request player risk score
  GET /api/injury/player/1

□ Should return last known score from DB
  Not a 503 error
  Response includes _warning field
  Response includes _cachedAt timestamp

□ Check logs
  "MLServiceUnavailableError caught"
  "Serving fallback from DB"
  "Fallback successful for player 1"
```

---

**Test 4 — Validation Middleware:**
```
□ Send invalid sport
  GET /api/injury/alerts/FOOTBALL

□ Should return 400
  errorCode: "VALIDATION_ERROR"
  message mentions valid sports

□ Send invalid player ID
  GET /api/injury/player/abc

□ Should return 400
  message explains playerId must be integer

□ Send missing required params
  GET /api/momentum/timeout/NBA
  Without query params

□ Should return 400
  Lists each missing required field
```

---

**Test 5 — Request Logging:**
```
□ Make any API request

□ Check console output
  Should see colorized HTTP log line
  With method URL status and time

□ Check logs/http.log
  Should have JSON entry
  All fields present

□ Make a slow request
  If any route takes over 2 seconds
  Should see "Slow request detected" warn log

□ Make a 404 request
  GET /api/nonexistent
  Should see 404 in logs at warn level
```

---

**Test 6 — ML Call Logging:**
```
□ Request risk score computation
  GET /api/injury/player/1?recalculate=true
  This forces ML call

□ Check logs
  Should see debug log before ML call
  "Calling ML endpoint /injury/compute-risk"
  
  Should see debug log after response
  "ML response received: 45ms"

□ Stop Python and try again
  Should see error log
  "ML service unavailable"
  "Using fallback"
```

---

**Test 7 — Data Fetch Logging:**
```
□ Trigger data sync job manually
  POST /api/jobs/trigger

□ Watch console output
  "Starting NBA data sync"
  "Fetching from BallDontLie: /teams"
  "Teams fetched: 30 records in 234ms"
  "Fetching players..."
  etc

□ Check logs/combined.log
  All sync operations present in JSON
```

---

**Test 8 — Error Tracking:**
```
□ Make 5 requests with invalid sport
  GET /api/injury/alerts/INVALID

□ Check error tracking route
  GET /api/health/errors

□ validationErrors count should be 5
  rate should show per minute figure

□ Status should still be "healthy"
  5 validation errors is not critical
```

---

**Test 9 — Log Files:**
```
□ Run app for a few minutes
  Make various requests
  Some successful, some errored

□ Check logs/ folder
  combined.log should exist and have content
  error.log should exist
  http.log should exist

□ Verify JSON format
  Each line should be valid JSON
  Parse a few lines manually

□ Verify log rotation config
  Inspect Winston transport settings
  maxsize and maxFiles correctly set
```

---

**Test 10 — Startup Log:**
```
□ Restart the server

□ Verify startup banner appears
  Version, environment, port all correct
  All routes listed
  All jobs listed
  Cache status shown

□ This is what judges see first
  Should be clean and impressive
```

---

## Phase 8 Complete File List

```
src/
├── utils/
│   ├── errors.ts                ← new (all custom error classes)
│   ├── logger.ts                ← updated (full Winston setup)
│   ├── error.tracker.ts         ← new (error counting)
│   └── log.manager.ts           ← new (log file management)
│
├── middleware/
│   ├── error.middleware.ts      ← updated (global handler)
│   ├── request.logger.ts        ← new (HTTP logging)
│   ├── validation.middleware.ts ← new (Zod validation)
│   └── fallback.handlers.ts     ← new (specific fallbacks)
│
├── ml/
│   └── ml.logger.ts             ← new (ML call logging)
│
└── routes/
    ├── health.routes.ts         ← updated (add error stats)
    └── logs.routes.ts           ← new (log viewer route)
```

---

## Phase 8 Summary

| Step | What It Builds | Key Output |
|---|---|---|
| Step 1 | Philosophy | Three level error model clear |
| Step 2 | Custom error classes | Typed errors for every scenario |
| Step 3 | Global error middleware | Central error catching |
| Step 4 | Specific fallback handlers | Graceful degradation |
| Step 5 | Request validation | Bad input caught early |
| Step 6 | Winston logger | Structured logging system |
| Step 7 | Request logging | Every HTTP request tracked |
| Step 8 | ML call logging | Python calls tracked and timed |
| Step 9 | Data fetch logging | API calls tracked |
| Step 10 | Error tracking | Pattern detection |
| Step 11 | Log management | Files rotated and viewable |
| Step 12 | Testing | Everything verified |

---

## What Phase 8 Delivers

```
After Phase 8 is complete

Robustness
├── App never crashes from bad input
├── ML service down → still serves data
├── Sports API down → serves cached data
├── DB error → serves memory cached data
└── Unknown errors → safe message, full internal log

Debuggability
├── Every request logged with timing
├── Every ML call logged with performance
├── Every error logged with full context
├── Log files persisted to disk
└── Log viewer route for live inspection

Judge impressiveness
├── Startup banner looks professional
├── Colorized console logs look polished
├── Error responses are clean and informative
├── App handles all edge cases gracefully
└── Error tracking route shows system health

This is what separates a hackathon project
from a production-ready system
Judges who know engineering will notice
```

**Phase 8 is the safety net under everything else**
**Without it one bad request can break the demo**
**With it the app handles anything a judge throws at it**