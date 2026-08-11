# Phase 1 — Project Foundation — Step by Step 

---

## Overview of Steps

```
Step 1 → Initialize Node.js project
Step 2 → Setup TypeScript
Step 3 → Setup folder structure
Step 4 → Install all dependencies
Step 5 → Setup Express app
Step 6 → Setup environment variables
Step 7 → Setup middleware
Step 8 → Setup logger
Step 9 → Setup error handling
Step 10 → Setup health check route
Step 11 → Test everything runs
```

---

## Step 1 — Initialize Node.js Project

**What we do:**
```
Create the root project folder
Initialize npm inside it
This creates the package.json file
which is the foundation of the entire project
```

**Commands to run:**
```
mkdir aqx-sports-backend
cd aqx-sports-backend
npm init -y
```

**What you get after this:**
```
aqx-sports-backend/
└── package.json
```

**Nothing else yet. Just the base.**

---

## Step 2 — Setup TypeScript

**What we do:**
```
Install TypeScript and its Node.js type definitions
Create tsconfig.json which tells TypeScript
how to compile our code
Setup nodemon for auto restart on file changes
Setup ts-node so we can run TypeScript directly
```

**Packages to install:**
```
typescript → TypeScript compiler
ts-node → Run TypeScript without compiling first
nodemon → Auto restart on file changes
@types/node → TypeScript types for Node.js
@types/express → TypeScript types for Express
```

**tsconfig.json settings we need:**
```
target → ES2020
module → commonjs
rootDir → ./src
outDir → ./dist
strict → true
esModuleInterop → true
skipLibCheck → true
resolveJsonModule → true
```

**nodemon.json settings:**
```
watch → src folder
ext → ts files only
exec → ts-node src/app.ts
```

**package.json scripts we add:**
```
dev → nodemon (runs development server with auto restart)
build → tsc (compiles TypeScript to JavaScript)
start → node dist/app.js (runs compiled production code)
```

**What you get after this:**
```
aqx-sports-backend/
├── package.json
├── tsconfig.json
└── nodemon.json
```

---

## Step 3 — Setup Folder Structure

**What we do:**
```
Create every folder the project needs
All empty for now
We just want the skeleton in place
so every future phase knows exactly where to put things
```

**Full folder structure to create:**
```
aqx-sports-backend/
│
├── src/
│ ├── routes/
│ ├── controllers/
│ ├── services/
│ ├── data/
│ ├── ml/
│ ├── db/
│ ├── jobs/
│ ├── middleware/
│ ├── utils/
│ └── types/
│
├── prisma/
│
├── python_ml/
│
├── logs/
│
└── cache/
```

**Also create placeholder files so Git tracks empty folders:**
```
Each empty folder gets a .gitkeep file inside it
This is standard practice
```

---

## Step 4 — Install All Dependencies

**What we do:**
```
Install every package the backend needs
Split into production dependencies and dev dependencies
Do this all at once so nothing is missing later
```

**Production Dependencies:**
```
express → Web framework
cors → Handle cross origin requests
dotenv → Load environment variables
helmet → Security headers
morgan → HTTP request logging
winston → Advanced application logging
node-cache → In memory caching
better-sqlite3 → SQLite database driver
@prisma/client → Prisma database ORM client
zod → Request validation and schema
axios → HTTP calls to Python ML service
swagger-ui-express → Auto generated API documentation
swagger-jsdoc → Generate swagger from comments
express-rate-limit → Rate limiting for API protection
compression → Gzip response compression
uuid → Generate unique IDs
date-fns → Date manipulation utilities
```

**Dev Dependencies:**
```
typescript → TypeScript compiler
ts-node → Run TypeScript directly
nodemon → Auto restart on changes
prisma → Prisma CLI for migrations
@types/node → Node types
@types/express → Express types
@types/cors → CORS types
@types/morgan → Morgan types
@types/better-sqlite3 → SQLite types
@types/swagger-ui-express → Swagger types
@types/compression → Compression types
eslint → Code linting
prettier → Code formatting
@typescript-eslint/parser → ESLint TypeScript support
@typescript-eslint/eslint-plugin → ESLint TypeScript rules
```

**After install your package.json dependencies section looks clean and complete**
**No missing packages mid-build**

---

## Step 5 — Setup Environment Variables

**What we do:**
```
Create the .env file with all variables the app needs
Create .env.example as a template for others
Add .env to .gitignore immediately so secrets never get pushed
```

**.env file contains:**
```
General
├── PORT → 8000
├── NODE_ENV → development
└── APP_NAME → AQX Sports Intelligence

Database
└── DATABASE_URL → file:./prisma/aqx.db

Python ML Service
└── PYTHON_ML_URL → http://localhost:8001

Cache TTL Settings
├── CACHE_TTL_SHORT → 21600 (6 hours in seconds)
├── CACHE_TTL_MEDIUM → 86400 (24 hours in seconds)
└── CACHE_TTL_LONG → 604800 (7 days in seconds)

Logging
└── LOG_LEVEL → debug

CORS
└── ALLOWED_ORIGINS → http://localhost:3000

Rate Limiting
├── RATE_LIMIT_WINDOW_MS → 900000 (15 minutes)
└── RATE_LIMIT_MAX → 100 (requests per window)

Optional AI
└── OPENAI_API_KEY → leave blank for now
```

**.env.example is identical but with empty values:**
```
PORT=
NODE_ENV=
DATABASE_URL=
PYTHON_ML_URL=
and so on for every variable
```

**.gitignore must include:**
```
.env
node_modules/
dist/
logs/
cache/
prisma/aqx.db
```

---

## Step 6 — Setup Express App

**What we do:**
```
Create the main app.ts file
This is the heart of the backend
Everything plugs into this file
```

**What app.ts sets up in order:**
```
1. Import Express and all middleware packages
2. Create Express app instance
3. Apply security middleware (helmet)
4. Apply CORS middleware with allowed origins from env
5. Apply compression middleware
6. Apply JSON body parser with size limit
7. Apply Morgan HTTP logger
8. Apply rate limiter
9. Register all route files (empty for now, just placeholders)
10. Register 404 handler for unknown routes
11. Register global error handler
12. Export the app
```

**What server.ts does separately:**
```
Imports the app from app.ts
Reads PORT from environment
Starts the server listening
Logs startup message with port and environment
This separation makes testing easier later
```

**Why separate app.ts and server.ts:**
```
app.ts → the Express configuration (testable)
server.ts → the actual server start (not needed in tests)
Clean separation of concerns
```

---

## Step 7 — Setup Middleware Files

**What we do:**
```
Create each middleware file in src/middleware/
These are all empty shells for now
Just the function signature and an export
Real logic gets added as we need it
```

**cors.middleware.ts:**
```
Reads ALLOWED_ORIGINS from env
Splits by comma if multiple origins
Returns configured cors options object
Handles preflight OPTIONS requests
```

**logger.middleware.ts:**
```
Uses Morgan for HTTP request logging
Logs method, URL, status, response time
Different format for development vs production
Dev → colored and readable
Prod → JSON format for log aggregation
```

**error.middleware.ts:**
```
Global error handler Express middleware
Takes 4 parameters (err, req, res, next)
Reads error status code or defaults to 500
Returns standard error JSON response shape
Logs the full error with stack trace
Never exposes stack traces in production
```

**Standard error response shape:**
```
success → false
status → HTTP status code
message → Human readable error message
error → Error code string
timestamp → When error occurred
```

**cache.middleware.ts:**
```
Checks node-cache for cached response
If found returns immediately without hitting controller
If not found lets request through
After response stores result in cache
Uses request URL as cache key
```

**Standard success response shape:**
```
success → true
status → HTTP status code
data → The actual response data
message → Optional success message
timestamp → When response was generated
```

---

## Step 8 — Setup Logger

**What we do:**
```
Create the Winston logger in src/utils/logger.util.ts
This is used everywhere in the app
Much more powerful than console.log
Writes to files and console simultaneously
```

**Logger configuration:**
```
Transports (where logs go)
├── Console transport
│ ├── Colorized output in development
│ └── Simple format in production
├── File transport for errors only
│ └── logs/error.log
└── File transport for all logs
    └── logs/combined.log

Log levels used
├── error → something broke
├── warn → something suspicious
├── info → normal operation events
├── debug → detailed development info
└── http → HTTP request details

Log format
├── Timestamp
├── Level
├── Message
└── Any extra data passed in
```

**Log files behavior:**
```
Max file size → 20MB per file
Max files → 14 days of logs kept
Old logs → automatically deleted
logs/ folder → already created in Step 3
```

---

## Step 9 — Setup Response Utility

**What we do:**
```
Create src/utils/response.util.ts
This ensures every API response
looks exactly the same no matter which route sends it
Consistency is important for the frontend
```

**Functions in response.util.ts:**
```
sendSuccess(res, data, message, statusCode)
└── Sends standard success response

sendError(res, message, statusCode, errorCode)
└── Sends standard error response

sendPaginated(res, data, page, limit, total)
└── Sends paginated list response with meta
```

**Paginated response shape:**
```
success → true
data → array of items
meta
├── page → current page number
├── limit → items per page
├── total → total record count
├── totalPages → calculated total pages
└── hasNext → boolean if more pages exist
```

---

## Step 10 — Setup Health Check Route

**What we do:**
```
Create the first real working route
GET /api/health
This proves the server is running
and all basic systems are connected
Judges and developers use this constantly
```

**What health check returns:**
```
status → "ok"
environment → development or production
timestamp → current server time
version → app version from package.json
uptime → how long server has been running in seconds
services
├── database → "connected" or "disconnected"
├── cache → "connected" or "disconnected"
└── mlService → "connected" or "disconnected"
```

**How it checks each service:**
```
Database → runs a simple SELECT 1 query via Prisma
Cache → calls node-cache stats method
ML Service → sends GET to Python service health endpoint
```

---

## Step 11 — Setup ESLint and Prettier

**What we do:**
```
Configure code style rules
Keeps all code consistent and clean
Important when working fast in a hackathon
Catches bugs before runtime
```

**.eslintrc.json settings:**
```
Parser → TypeScript ESLint parser
Extends → recommended TypeScript rules
Rules we add
├── no unused variables → error
├── no explicit any → warning
├── consistent returns → error
└── no console → warning (use logger instead)
```

**.prettierrc settings:**
```
Semi colons → true
Single quotes → true
Tab width → 2
Trailing comma → es5
Print width → 100
Arrow parens → avoid
```

**package.json scripts to add:**
```
lint → eslint src
lint:fix → eslint src with fix flag
format → prettier write on src folder
```

---

## Step 12 — Verify Everything Works

**What we do:**
```
Run the development server
Hit the health check endpoint
Confirm everything is connected
Before moving to Phase 2
```

**Verification checklist:**
```
□ npm run dev starts without errors
□ Server logs show port and environment
□ GET /api/health returns 200
□ Response shows correct shape
□ Logs folder getting log files written
□ No TypeScript compilation errors
□ No ESLint errors in any file
□ .env is not tracked by Git
□ node_modules is not tracked by Git
```

---

## Final Phase 1 File Structure

```
aqx-sports-backend/
│
├── src/
│ ├── routes/
│ │ └── health.routes.ts ← only real route for now
│ ├── controllers/
│ │ └── health.controller.ts
│ ├── services/
│ │ └── .gitkeep
│ ├── data/
│ │ └── .gitkeep
│ ├── ml/
│ │ └── .gitkeep
│ ├── db/
│ │ └── prisma.client.ts ← Prisma singleton setup
│ ├── jobs/
│ │ └── .gitkeep
│ ├── middleware/
│ │ ├── cors.middleware.ts
│ │ ├── logger.middleware.ts
│ │ ├── error.middleware.ts
│ │ └── cache.middleware.ts
│ ├── utils/
│ │ ├── logger.util.ts
│ │ └── response.util.ts
│ ├── types/
│ │ └── .gitkeep
│ ├── app.ts
│ └── server.ts
│
├── prisma/
│ └── .gitkeep
│
├── python_ml/
│ └── .gitkeep
│
├── logs/
│ └── .gitkeep
│
├── cache/
│ └── .gitkeep
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── nodemon.json
├── .eslintrc.json
└── .prettierrc
```

---

## Phase 1 Summary

| Step | What It Does | Output |
|---|---|---|
| Step 1 | Init Node project | package.json |
| Step 2 | Setup TypeScript | tsconfig, nodemon |
| Step 3 | Create folder structure | All empty folders |
| Step 4 | Install dependencies | node_modules |
| Step 5 | Environment variables | .env files |
| Step 6 | Express app setup | app.ts, server.ts |
| Step 7 | Middleware files | 4 middleware files |
| Step 8 | Logger setup | Winston logger |
| Step 9 | Response utilities | Standard response shape |
| Step 10 | Health check route | First working endpoint |
| Step 11 | ESLint and Prettier | Code quality tools |
| Step 12 | Verify everything | Confirmed working |

**Phase 1 is purely foundation**
**No sports data, no models, no database yet**
**Just a clean, running, well structured Express server**
**Ready for Phase 2 to plug the database in**
