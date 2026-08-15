# AQX Sports Intelligence — Testing and What's Left To Do

---

## Part 1 — How To Test Everything

---

### Level 1 — Testing The Backend Alone

**Start here before touching the app**
```
Get the backend running first
Get the Python service running second
Confirm they talk to each other
Then worry about the app
```

**How to confirm backend is alive:**
```
Open any browser or API tool like Postman
Go to the backend health endpoint
You should see a response that says
status is ok
database is connected
ML service is connected
environment is development

If any of those say disconnected
fix that before moving forward
Nothing else will work
```

**How to confirm Python service is alive:**
```
Go to the Python service health endpoint directly
You should see
status ok
all four models loaded
nfl data available
If models say not loaded
the Python service started but models failed to initialize
Check the Python terminal for error messages
```

**How to confirm they talk to each other:**
```
The Node health endpoint checks Python
If Node health shows ML service connected
they are communicating correctly
If Node health shows ML service disconnected
but Python is running
it is usually a port mismatch or CORS issue
Check that Node is pointing to the right Python port
```

---

### Level 2 — Testing Data Fetching

**Test NBA data first because it is the most reliable:**
```
Manually trigger the data sync job
Use the job trigger endpoint
Watch the terminal where Node is running
You should see log messages like
Starting NBA data sync
Fetching teams
30 teams fetched
Fetching players
450 players fetched
Game logs synced

After sync completes
Open a SQLite viewer tool
Look at the teams table
Should have 30 rows
Look at the players table
Should have hundreds of rows
Look at the player game logs table
Should have thousands of rows

If any table is empty
The fetch ran but the write failed
Look at the error logs
```

**What to do if data sync fails:**
```
Most common reasons

Rate limit from sports API
→ Wait a few minutes and try again
→ The retry logic should handle this automatically

Network error
→ Check your internet connection
→ Check if the sports API website is up

Empty response from API
→ The API might have changed
→ Check if the endpoint URL still works
→ Try hitting the API URL directly in the browser

Database write error
→ Check if the SQLite file exists in the right location
→ Check if Prisma migrations have been run
→ Look at the error log for the specific Prisma error
```

---

### Level 3 — Testing The ML Models

**Test injury risk calculation:**
```
After data sync has run and player game logs exist
Call the player risk endpoint for any player
Pass any valid player ID

You should get back
a risk score between 0 and 100
a zone of green yellow or red
z-score values for each metric
a plain English explanation

If you get an error about insufficient data
That player has less than 5 games in the window
Try a different player who has played more games
Star players who play every game are safest to test with

If you get ML service unavailable
Python is not running or not reachable
Check the Python terminal
```

**Test decision EV calculation:**
```
This requires NFL play by play data in the database
After NFL sync runs
Call the coach leaderboard endpoint for NFL
You should see coaches ranked by EV rate

If the leaderboard is empty
Decisions were not extracted from play by play
Check if the play by play table has data
Check if the decision extraction step ran in the sync
```

**Test momentum model:**
```
Call the momentum analysis endpoint for NBA
First time this runs it will be slow
Could take 20 to 30 seconds
Python is running the Cox model on the full season

After first run the result is cached
Subsequent calls should be under 100 milliseconds

If Cox model fails
Check that the lifelines library is installed in Python
Check that there is enough play by play data
The model needs at least 50 games to produce reliable results
```

---

### Level 4 — Testing Individual API Endpoints

**Go through every endpoint systematically**

**Injury endpoints to test:**
```
Get risk for a specific player
→ Should return full risk profile
→ Try a player with many games and one with few

Get risk for an entire team
→ Should return all players sorted by risk score
→ Count should match team roster size

Get league alerts
→ Should return players in red zone
→ Try filtering by yellow zone also

Get player risk history
→ Should return array of past scores
→ Oldest first sorted by date
```

**Decision endpoints to test:**
```
Get coach leaderboard for NFL
→ Should return coaches ranked by EV rate
→ Try different decision type filters
→ Try playoff filter vs regular season

Get all decisions for one coach
→ Should return chronological list
→ Check that isOptimal is true or false
→ Check that processVsOutcome numbers add up correctly

Get decisions for one specific game
→ Should return both coaches decisions
→ Should be sorted chronologically by game time
```

**Momentum endpoints to test:**
```
Get momentum analysis for NBA
→ Should return Cox model results
→ p-value should be between 0 and 1
→ Plain explanation should be readable

Get game timeline for a specific game
→ Should return two arrays of momentum scores
→ Arrays should have many data points
→ Timeline events should correspond to scoring plays

Get sport comparison
→ Should return all four sports
→ Sorted by effect size
→ Each has a verdict label

Get timeout recommendation
→ Try various input combinations
→ Recommendation should change based on situation
→ High consecutive scores should usually recommend timeout
```

**Search endpoints to test:**
```
Search with 2 characters
→ Should return results

Search with 1 character
→ Should return validation error

Search with a name that does not exist
→ Should return empty array not an error

Search with sport filter
→ Should only return results from that sport
```

---

### Level 5 — Testing The Caching

**Verify memory cache is working:**
```
Make any search request
Note the response time
Note the X-Cache-Status header says MISS

Make the exact same request again immediately
Response should be significantly faster
X-Cache-Status should say HIT
X-Cache-Layer should say memory

This proves memory cache is working
```

**Verify SQLite cache survives restart:**
```
Make a coach leaderboard request
Note it says MISS and takes time to compute

Restart the Node server completely

Make the same leaderboard request again
Should say HIT even after restart
This is because SQLite cache persists
Unlike memory cache which clears on restart
```

**Verify stale while revalidate:**
```
Make a request and get a cache HIT
Manually invalidate that cache entry
Using the cache invalidate endpoint

Make the request again
Should get STALE status
Response still comes back quickly
Background recompute triggered

Wait 5 seconds
Make request again
Should now be HIT with fresh data
```

---

### Level 6 — Testing Error Handling

**Test what happens when Python is down:**
```
Stop the Python ML service
Make a request that requires ML
Like getting a player risk score with recalculate flag

App should receive a response
Not an error crash
Response should include last known score from database
And a warning that ML service is unavailable

Restart Python
Make the same request
Should work normally again
```

**Test what happens with bad input:**
```
Send an invalid sport name like FOOTBALL
Should receive a 400 error
With a clear message about valid sport names

Send a player ID that does not exist
Should receive a 404 error
With message saying player not found

Send missing required parameters
To the timeout optimizer endpoint
Should receive a 400 error
Listing which parameters are missing
```

**Test what happens with database errors:**
```
This is harder to simulate
But you can temporarily rename the SQLite file
And try making requests

Requests should fail gracefully
With a 500 error and safe message
Not exposing any internal details
Check the error log file
Should have the full error recorded
```

---

### Level 7 — Testing The React Native App

**Test navigation:**
```
Open the app
Go through all three onboarding screens
Select a sport and role
Arrive at Home screen

Tap each bottom tab
Injury Decisions Momentum
All should navigate without crashing

Tap a player in the injury list
Should navigate to Player Risk screen
Tap back
Should return to the list
```

**Test data loading:**
```
Kill internet connection
Open the app
Should show cached data or graceful offline message
Not a crash or blank screen

Restore internet
Pull to refresh
Data should update
```

**Test search:**
```
Tap search icon
Type a player name
Results should appear within a second
Tap a result
Should navigate to correct detail screen
```

**Test story mode:**
```
Tap story mode button on Home screen
Should show loading briefly
Then show a readable paragraph
About whatever is happening in the selected sport
Tap share
Native share sheet should open
```

**Test role changes:**
```
Go to settings
Change role from Analyst to Fan
Navigate to Momentum Overview
Statistical section should be hidden
Only plain explanation visible

Change back to Analyst
Statistical section should be visible again
```

---

## Part 2 — What Else Needs To Be Done

---

### Thing 1 — Environment Configuration for Demo

**What this means:**
```
Right now the app probably has
"localhost:8000" hardcoded as the backend URL
This only works when running on the same computer
For a hackathon demo judges need to access it

Options
├── Run backend on your laptop
│   Connect phone to same WiFi
│   Use your laptop IP address instead of localhost
│   Like 192.168.1.100:8000
│
├── Deploy backend to Render or Railway (free)
│   Get a public URL like aqx-backend.onrender.com
│   App points to that URL
│   Works from anywhere
│   Best option for hackathon
│
└── Use ngrok temporarily
    Creates a public tunnel to localhost
    Free and instant
    Good for quick demos
```

**Make the backend URL configurable:**
```
In the app settings screen
Add a field where the URL can be changed
This lets you switch between
local testing and deployed backend
Without rebuilding the app
```

---

### Thing 2 — Seed Data for Demo

**The most important thing for a hackathon:**
```
Judges will not wait for data to sync
They open the app and expect to see something
You need pre-loaded data ready to go

Create a seed script that
Inserts enough realistic data for a compelling demo
Focus on NBA because it is most familiar to judges

Minimum seed data needed
├── All 30 NBA teams
├── All NBA players with recent game logs
├── At least 5 players in red zone
│   With realistic looking risk scores
├── Coach decisions for NFL coaches
│   With variety of optimal and suboptimal
├── Momentum analysis results for all four sports
│   With NBA showing "inconclusive"
│   And NHL showing "significant"
│   This tells the best story
├── At least 10 recent game timelines
│   For the game replay screen
└── Timeout recommendations pre-computed
    For all scenarios
```

---

### Thing 3 — Loading States

**Every screen needs proper loading states:**
```
When data is being fetched
Show something instead of a blank screen
Options
├── Skeleton screens
│   Gray placeholder shapes
│   Same layout as real content
│   Look very professional
│
├── Spinner
│   Simple loading circle
│   Less impressive but easier to build
│
└── Progressive loading
    Show whatever loads first
    Fill in rest as it arrives
    Best user experience

For hackathon minimum
At least show a spinner on every screen
Skeleton screens on Home and Leaderboard
Those are the screens judges see most
```

---

### Thing 4 — Empty States

**Every list needs an empty state:**
```
What shows when there are no results

Without empty state
User sees a blank screen
Looks like a bug

With empty state
User sees an illustration and message
Looks intentional and polished

Empty states needed
├── Search with no results
│   "No players found for this search"
│
├── No red zone players
│   "All players are within normal workload"
│   Show a green checkmark
│
├── No games in last 48 hours
│   "No games played recently"
│
└── Coach with no decisions recorded
    "No decisions found for this filter"
```

---

### Thing 5 — Pull To Refresh

**Every list screen needs pull to refresh:**
```
User swipes down from top of list
Loading indicator appears
Fresh data fetched from backend
List updates

This is expected behavior on mobile
If it is missing the app feels incomplete
React Native has built in pull to refresh component
Easy to add to every list screen
```

---

### Thing 6 — Error States

**Every screen needs error states:**
```
When a request fails
Show something useful instead of crash

Minimum error state
├── Error icon or illustration
├── "Something went wrong" message
├── "Try again" button that retries the request
└── Specific message if possible
    "Could not load player data"
    Not just generic error

For the demo
At minimum the Home screen and three main module screens
need proper error states
Other screens can have basic fallbacks
```

---

### Thing 7 — The Swagger Documentation

**Make sure it is complete and working:**
```
The Python FastAPI service auto-generates docs
The Node backend needs Swagger configured
Go to /api/docs in the browser
Every endpoint should be listed
Every endpoint should show example request and response

During the demo if a judge asks
"Can I see the API?"
You open /api/docs in the browser
They see a professional documentation page
Very impressive
```

---

### Thing 8 — Performance Testing

**Before the demo test these specific things:**
```
How long does first app load take?
From opening app to Home screen showing data
Should be under 3 seconds
If slower look at what is blocking

How long does leaderboard load?
If not cached should be under 2 seconds
If cached should be under 200 milliseconds

How long does player risk load?
If cached should be under 500 milliseconds
If computing fresh should be under 5 seconds

How long does momentum game replay load?
First time could be 10 to 20 seconds
Cox model is slow on first computation
Subsequent loads should be instant from cache

Fix any screen that takes more than 5 seconds uncached
Judges will not wait longer than that
```

---

### Thing 9 — Demo Script Preparation

**Plan exactly what you will show:**
```
A hackathon demo is typically 3 to 5 minutes
You cannot show everything
Pick the most impressive path

Recommended demo path
1 minute — Open app on phone
           Walk through onboarding quickly
           Select NBA and Analyst

1 minute — Home screen
           Point out the three sections
           Note the red zone alert
           Tap a player to show risk profile
           Show the workload chart
           Read the plain English explanation

1 minute — Decisions tab
           Show coach leaderboard
           Tap a coach to show drill down
           Show the process vs outcome matrix
           Open one specific decision
           Show the EV comparison

1 minute — Momentum tab
           Show the verdict card
           Switch to sport comparison
           Point out hockey vs baseball difference
           Open timeout optimizer
           Enter a scenario and show recommendation

30 seconds — Story mode
             Tap story mode button
             Read the generated paragraph aloud
             This is your closing moment

Practice this path until it takes exactly 4 minutes
Know where to tap without thinking
```

---

### Thing 10 — What To Have Ready For Judge Questions

**Common judge questions and your answers:**

```
"Where does the data come from?"
Answer → Free sports APIs
BallDontLie for NBA
ESPN public API for NFL
Official MLB Stats API for baseball
All completely free and open

"Is this real data or fake?"
Answer → Real data
Synced from the official APIs
Updated every 6 hours automatically
The risk scores you see are based on actual game logs

"How does the injury risk work?"
Answer → We do not compare to the league average
We compare each player to themselves
Their personal 21 day baseline
If their recent workload spikes more than
1.5 standard deviations above their own norm
we flag them
That is why it catches risks
that league average comparisons miss

"How do you know if a decision was right?"
Answer → We compute the expected value
of every available option at that moment
Using a win probability model
trained on historical game data
The coach is graded on whether they chose
the highest expected value option
Not on whether it worked out

"Is momentum actually real?"
Answer → It depends on the sport
Our Cox proportional hazard model
finds statistically significant momentum
in hockey and football
But not in basketball or baseball
We show the p-values and confidence intervals
so you can judge the strength of the evidence yourself

"Could this be a real business?"
Answer → Yes
Athletic trainers would pay for Module 1
Teams are already paying millions
for sports analytics software
This personalizes it in a way
that existing tools do not
```

---

### Thing 11 — Final Checklist Before Submitting

```
Backend
□ All API endpoints return correct responses
□ Caching is working and measurably faster
□ Background jobs run on schedule
□ Error handling tested with Python down
□ Error handling tested with bad inputs
□ Logs writing to files correctly
□ Swagger docs accessible at /api/docs
□ Health endpoint shows all services green
□ Environment variables documented in .env.example
□ README explains how to run the project

Python ML Service
□ All four models load on startup
□ Injury risk returns scores for all players
□ Decision EV returns results for all decision types
□ Cox momentum model runs without error
□ Timeout scenarios pre-computed for NBA and NFL
□ Story mode generates readable text
□ Health endpoint shows all models loaded

React Native App
□ Onboarding flow works end to end
□ All 22 screens navigate without crashing
□ Home screen shows real data from all three modules
□ Player risk screen shows chart and explanation
□ Coach leaderboard shows ranked list
□ Momentum shows verdict card
□ Game replay scrubber moves smoothly
□ Timeout optimizer gives instant recommendations
□ Search returns results within 1 second
□ Story mode generates and displays text
□ Settings lets you change sport and role
□ All screens have loading states
□ All screens have error states
□ Pull to refresh works on list screens
□ Offline state shows graceful message

Data
□ Seed data loaded for NBA NFL MLB
□ At least 5 players in red zone
□ Coach leaderboard has at least 20 coaches
□ Momentum analysis exists for all four sports
□ At least 10 game timelines for replay screen
□ Timeout recommendations pre-computed

Demo preparation
□ Backend deployed or tunnel set up
□ App pointing to deployed backend URL
□ Demo path practiced at least 5 times
□ Each step takes expected time
□ Answers to judge questions prepared
□ App on a charged phone
□ Backup plan if phone dies (browser version)
```

---

### Thing 12 — Nice To Have If Time Permits

**These are not required but would impress:**
```
Push notifications
When a player on your watched team
enters the red zone
Send a push notification to the phone
This makes it feel like a live product

Offline mode
Store last successful response in device storage
Every screen works even with no internet
Shows production level thinking

Dark and light mode
App already uses dark theme
Adding light mode toggle is relatively quick
Shows attention to detail

Animated charts
Charts that animate when they first load
Much more impressive than static charts
React Native Victory or Victory Native library

Haptic feedback
Phone vibrates slightly when
a player enters red zone
When a recommendation appears
Small touches that feel native and polished

Share screenshots
User can share a screenshot of any screen
With AQX branding overlaid automatically
Like a sports card format
Very shareable and shows product thinking
```

---

## The Honest Priority Order

```
Must work for a passing submission
├── Backend health endpoint returns green
├── At least one player risk score loads
├── Coach leaderboard shows ranked coaches
├── Momentum verdict shows for NBA
└── App navigates between all main screens

Should work for a good submission
├── All endpoints return real data
├── Caching measurably speeds up requests
├── Search works and returns results
├── Story mode generates readable text
└── Game replay shows momentum timeline

Must work for a winning submission
├── Everything above
├── Seamless onboarding to data flow
├── No crashes during demo path
├── Loading states on every screen
├── Error handling demonstrated live
├── Swagger docs impressive judges can explore
├── Background jobs shown running
└── The pitch connects the technology to real buyers
```

**The difference between good and winning**
**is not more features**
**it is confidence in the features you have**
**and a story that makes judges feel the value**