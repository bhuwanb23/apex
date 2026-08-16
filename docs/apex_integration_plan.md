# Apex Sports Intelligence — Complete Integration Plan

---

## How The App and Backend Talk To Each Other

```
React Native App
runs on your phone
        ↓
Every time a screen loads or user does something
the app sends a request to the Node.js backend
        ↓
Node.js backend
runs on a server
checks cache first
then database
then Python if needed
        ↓
Python ML service
runs alongside Node
handles all the math
        ↓
Data flows back up
Python → Node → App
App displays it beautifully
```

**One rule that applies everywhere:**
```
The app never talks to the sports APIs directly
The app never runs any calculations
The app only displays what the backend gives it
All intelligence lives in the backend
App is purely the presentation layer
```

---

## Before Any Screen Loads — App Startup

**What happens the very first time someone opens the app:**
```
App opens
Checks device storage for saved preferences
├── Has the user been here before?
├── What sport did they select?
└── What role did they select?

If first time ever
→ Show onboarding screens
→ No backend calls yet at this point

If returning user
→ Skip onboarding entirely
→ Go straight to Home screen
→ Start loading data immediately
```

**What happens every time the app opens (returning user):**
```
App wakes up
Reads saved sport and role from device storage
Sends a quick ping to the backend health check
├── Is the backend running?
├── Is the Python ML service running?
└── What is the current data freshness?

If backend responds healthy
→ Show Home screen with fresh data

If backend is slow to respond
→ Show Home screen with whatever is in local cache
→ Show small banner "Loading latest data"
→ Update silently in background

If backend is completely unreachable
→ Show Home screen with last cached data
→ Show banner "You are offline. Showing last known data"
```

---

## Onboarding Screens — No Backend Needed

**Welcome Screen:**
```
Purely local screen
No backend calls at all
Everything is hardcoded text and animations
User reads the value props
Taps Get Started
```

**Sport Select Screen:**
```
Also purely local
Shows NBA NFL MLB NHL as options
User taps one or multiple
Their choice is saved to device storage
No backend call needed
The backend does not need to know
which sport the user prefers
The app just uses it to filter requests later
```

**Role Select Screen:**
```
Also purely local
User picks trainer coach analyst or fan
Saved to device storage
When complete app navigates to Home
NOW the backend calls begin
```

---

## Home Screen — How It Gets Its Data

**The Home screen is the most complex**
**It pulls from all three modules at once**

**When Home screen loads:**
```
App looks at saved sport preference
Let us say user selected NBA

App fires four separate requests to the backend
at the same time in parallel

Request 1 → Get top injury alerts for NBA
Request 2 → Get best and worst coach decision this week for NBA
Request 3 → Get momentum verdict for NBA current season
Request 4 → Get recent NBA games from last 48 hours

All four requests go out simultaneously
App shows loading skeletons while waiting
As each response comes back
that section of the screen fills in
Sections do not wait for each other
```

**How the injury alerts section gets its data:**
```
App asks backend
"Give me the top red zone players in NBA right now"

Backend checks its cache first
If data is less than 30 minutes old
Backend returns it instantly from memory

If data is stale
Backend queries the database
Gets all players whose latest risk score
puts them in the red zone
Returns the top 3 with their names teams scores
and what triggered the flag

App receives the list
Displays player name team risk score
and the trigger explanation
Each player card is tappable
```

**How the decision spotlight gets its data:**
```
App asks backend
"Give me one notable coaching decision from this week"

Backend queries the database
Finds the most recent coaching decision
where the EV difference was large
meaning coach either made a great or terrible call

Returns the decision with full context
coach name team what they decided
whether it was optimal
and a one line explanation

App displays it as a highlight card
Green if optimal red if not
```

**How the momentum snapshot gets its data:**
```
App asks backend
"Give me the current momentum verdict for NBA"

Backend checks if it has a recent season analysis
for NBA in its database
If yes returns the verdict immediately
isSignificant boolean
verdictLabel "real" or "myth"
shortExplanation one sentence

App displays the verdict pill
and the one sentence explanation
```

**How recent games get their data:**
```
App asks backend
"Give me NBA games from the last 48 hours"

Backend queries its games database table
Filters by sport and date range
Returns game records with
home team away team scores date
and whether momentum data exists for that game

App displays them as horizontal scrollable cards
Each card shows the matchup and score
```

---

## Injury Dashboard Screen — How It Works

**When user taps the Injury tab:**
```
App checks what sport is currently selected
Sends request to backend
"Give me the risk summary for all NBA players"

Backend has two paths depending on view

League view path
Backend queries the database
Gets all players where latest risk score
puts them in red or yellow zone
Counts totals per zone
Returns the counts and top players list

Team view path
User searches for or selects a team
App sends different request
"Give me all players on the Lakers with their risk scores"
Backend queries database for that specific team
Returns every player on roster with their current zone
```

**The traffic light system:**
```
Backend returns zone field for every player
Either "green" "yellow" or "red"
App reads this field
Displays a colored dot or badge next to each player
No calculation happens in the app
Backend already decided the zone
App just shows the color
```

**The last updated timestamp:**
```
Backend includes a computedAt field
in every risk score response
App reads this and shows it at the bottom
"Risk scores updated 2 hours ago"
If user taps refresh
App sends the same request with a recalculate flag
Backend forces fresh computation from Python ML
Returns new scores
```

---

## Player Risk Screen — How It Works

**When user taps a specific player:**
```
App already has basic player info from the list
Player ID name team
App navigates to Player Risk screen
passing the player ID

Player Risk screen immediately sends request
"Give me the full risk profile for player ID 237"

Backend receives this
Checks if there is a fresh risk score in the database
Fresh means computed within the last 6 hours

If fresh score exists
Backend returns it immediately
Includes risk score zone trigger metric
all z-scores baseline values
and the plain English explanation

If score is stale
Backend fetches player game logs from its database
Sends them to Python ML service
Python runs the z-score calculation
Returns risk score and all details
Backend saves the new score
Returns it to app
```

**How the workload chart gets built:**
```
Backend returns two things
The risk profile object
AND an array of game logs

Each game log contains
date minutes played distance high intensity events
back to back boolean days of rest

App receives this array
Passes it to a charting library
Chart library draws the line
App does not calculate anything
It just feeds the array to the chart
```

**How z-score bars are displayed:**
```
Backend returns minutesZScore distanceZScore intensityZScore
These are just numbers like 2.3 or 0.8

App checks each number
If above 1.5 → show as red bar
If 1.0 to 1.5 → show as yellow bar
If below 1.0 → show as green bar

Also backend returns
baselineMeanMinutes and recentAverageMinutes
App displays these as two bars side by side
Gray bar for baseline
Colored bar for recent
```

**How the risk history chart gets built:**
```
Separate request from the main risk profile request
App asks backend
"Give me the last 60 days of risk scores for player 237"

Backend queries the database
Gets all InjuryRiskScore records for that player
Ordered by date
Returns array of date and riskScore pairs

App feeds this array to a smaller line chart
Shows how the player's risk has fluctuated over time
```

---

## Team Risk Screen — How It Works

**When user selects a team:**
```
App sends request
"Give me all players on team ID 14 with their risk scores"

Backend queries players table filtered by team
For each player gets their latest risk score record
Combines everything into one response
Array of players each with their risk profile

App receives the array
Sorts by risk score descending so red zone players appear first
Renders the list
Each row shows zone dot name position score trigger
```

**The filter tabs:**
```
When user taps "Red" tab
App already has all player data in memory
from the initial response
It filters the existing array locally
No new backend request needed
This makes filtering feel instant
```

**Export PDF:**
```
User taps export button
App sends request to backend
"Generate a PDF report for team 14"

Backend collects all player risk data
Formats it into a structured PDF
Returns it as a file

App uses React Native's share functionality
Opens native share sheet
User can save or send the PDF
```

---

## League Alerts Screen — How It Works

**When screen loads:**
```
App sends request
"Give me all players in the red zone for NBA"

Backend queries database
Gets all players where zone is "red"
and isLatest is true
Joins with player and team information
Returns sorted by risk score

App displays the list
Each card shows player name team risk score
trigger explanation and how long in red zone

The "how long in red zone" calculation
Backend computes this by looking at
when the player's zone first became red
in recent consecutive scores
Returns it as a number of days
App just displays it
```

**Pull to refresh:**
```
User pulls down on the list
App sends the same request again
Backend checks if cache is still valid
Returns fresh or cached data
App updates the list
```

---

## Coach Leaderboard Screen — How It Works

**When Decisions tab loads:**
```
App sends request
"Give me the coach leaderboard for NFL
current season
all decision types
all game types"

Backend checks its cache
This is a 24 hour cache
If within 24 hours returns instantly

If stale
Backend queries the DecisionEVScores table
Joins with coaches and teams tables
Sorts by evRate descending
Assigns rank numbers
Returns paginated list

App receives the list
Renders each coach row
With rank name team EV rate and trend
```

**When user changes filters:**
```
User changes decision type from "All" to "4th Down"

App sends new request with the filter applied
"Give me coach leaderboard for NFL
4th down decisions only
current season"

Backend checks cache for this specific combination
Different filter = different cache key
May be a cache miss if this combination is new
Backend queries database with the filter
Returns filtered leaderboard

App rerenders the list
```

**The podium section:**
```
Backend returns coaches sorted by rank
First three in the array get displayed as podium
App reads rank 1 rank 2 rank 3
Places them visually in the podium layout
No special endpoint needed
Just the first three results from the list
```

---

## Coach Detail Screen — How It Works

**When user taps a coach:**
```
App has coach ID from the leaderboard item
Navigates to Coach Detail screen with coach ID

Two requests fire simultaneously
Request 1 → "Give me the scorecard summary for coach 45"
Request 2 → "Give me all decisions made by coach 45
             current season all types"

Request 1 returns
Total decisions optimal decisions EV rate rank
These populate the four stat boxes at top

Request 2 returns
Paginated list of every decision
Each with game context chosen action
EV values isOptimal and outcome
Also returns the processVsOutcome matrix
with the four cell counts already calculated by backend
```

**The process vs outcome matrix:**
```
Backend calculates the four cell counts
goodProcessGoodOutcome
goodProcessBadOutcome
badProcessGoodOutcome
badProcessBadOutcome

These are just four numbers
App receives them and renders the 2x2 grid
Each cell shows the count and a percentage
No calculation in the app
```

**When user taps a cell in the matrix:**
```
User taps "Good Process Bad Outcome" cell
App filters the decisions list below
to show only decisions where
isOptimal is true AND outcomeSuccess is false

This filtering happens locally in the app
App already has all the decisions loaded
Just filters the existing array
No new backend request
```

---

## Decision Drill Down Screen — How It Works

**When user taps a specific decision:**
```
App has the full decision object already
from the coach detail list
No new request needed for basic info

App navigates to drill down screen
passing the full decision object

Screen renders immediately with all data
Game context situation description
What coach chose
EV of that choice
EV of best available option
All alternatives with their EVs
```

**The alternatives comparison:**
```
Backend already included this in the decision object
alternativeActions is an array
Each item has action name EV probability values

App receives this array
Renders each as a card
Sorts by EV descending
Highlights the highest EV option
with a gold border
```

**The win probability display:**
```
Backend returns winProbabilityBefore
as a number between 0 and 1
Like 0.43

App converts to percentage for display
43%
Shows it in the context card at top
```

---

## Momentum Overview Screen — How It Works

**When Momentum tab loads:**
```
App sends request
"Give me the momentum analysis for NBA current season"

Backend checks MomentumAnalysis table
If fresh record exists returns it immediately

Returns
hazardCoefficient pValue
confidenceIntervalLow confidenceIntervalHigh
isSignificant effectSize
plainExplanation shortExplanation
verdictLabel gamesAnalyzed

App uses verdictLabel to show the big verdict text
Uses isSignificant to decide color
Green background for real momentum
Gray background for myth

Uses plainExplanation for the paragraph below
```

**The statistics section:**
```
Backend returns all the statistical fields
App just displays them as labeled cards
No interpretation happens in the app
Backend already decided what they mean
and included the verdictLabel

For non-analyst roles
App hides the statistics section entirely
Role is saved in device storage
If role is "fan" the stats section is not rendered
Only the plain explanation is shown
```

---

## Game Replay Screen — How It Works

**When user selects a game:**
```
App sends request
"Give me the momentum timeline for game ID 5892"

Backend checks MomentumGameData table
If timeline exists for this game returns it

Returns
homeTeamMomentum array
awayTeamMomentum array
timelineEvents array
peakHomeMomentum peakAwayMomentum
momentumShifts longestStreak

homeTeamMomentum is an array of objects
Each object has gameTimeSeconds and momentumScore
Like 200 data points across the game

App feeds both arrays to the charting library
Chart draws two lines across the game timeline
```

**How the scrubber works:**
```
User drags the scrubber left and right
The scrubber position maps to a game time in seconds

App reads the current scrubber position
Finds the closest data point in the timeline array
That happens entirely in the app
No backend call
The full timeline was loaded upfront

App updates the display
Shows game time score momentum values
at that exact moment
```

**The event dots on the chart:**
```
timelineEvents array contains all scoring events
Each has a gameTimeSeconds field
App plots dots on the chart at those time positions
When user taps a dot
App shows the event description from that array
All local no backend call
```

**The play button:**
```
When user taps play
App starts a timer interval
Every 100 milliseconds the scrubber advances
simulating real game time passing
User sees momentum changing live
Pause stops the interval
```

---

## Sport Comparison Screen — How It Works

**When screen loads:**
```
App sends one request
"Give me momentum analysis for all sports"

Backend fetches MomentumAnalysis records
for all four sports current season
Combines them into one response array
Each item has sport name verdict
hazardCoefficient pValue isSignificant effectSize shortExplanation

App receives the array
Sorts by effectSize descending
Strongest momentum sport first

Renders the horizontal bar chart
Bar length = effectSize value
Bar color = green if significant gray if not

Renders the sport list below
Each row shows sport verdict p-value
```

---

## Timeout Optimizer Screen — How It Works

**The inputs:**
```
All inputs are local sliders and selectors
Nothing sent to backend as user adjusts them
App just tracks the current values
consecutiveScores scoreDiff timeRemaining period timeoutsAvailable
```

**When user taps Get Recommendation:**
```
App takes all five input values
Sends request to backend
"Give me timeout recommendation for NFL
with these exact parameters"

Backend builds a scenario key from the parameters
Looks up TimeoutRecommendations table
Finds the pre-computed scenario that matches

Returns
shouldCallTimeout boolean
stopProbabilityWith percentage
stopProbabilityWithout percentage
probabilityDiff the difference
recommendationText plain English
confidenceLevel and sampleSize

App receives the response
Renders the recommendation card
Large YES or NO
The probability comparison bars
And the plain English text
```

**Why this feels instant:**
```
The backend pre-computed 2250 possible scenarios
When user taps the button
Backend just does a database lookup
No calculation needed at request time
Returns in under 50 milliseconds
Feels instant to the user
```

---

## Search Screen — How It Works

**As user types:**
```
User types "leb"
App waits until user has typed at least 2 characters
Then sends request
"Search for players matching leb in NBA"

Backend checks memory cache for this query
If cache hit returns instantly
If cache miss queries players table
WHERE firstName or lastName contains "leb"
Returns matching players with team and position

User types one more letter "lebr"
App sends new request with updated query
Response comes back in under 100ms usually
List updates with more specific results
```

**When user taps a result:**
```
Player result → App navigates to Player Risk Screen
Team result → App navigates to Team Risk Screen
Coach result → App navigates to Coach Detail Screen
Game result → App navigates to Game Replay Screen

The result object already has the ID needed
App passes it to the destination screen
```

---

## Settings Screen — How It Works

**Displaying current settings:**
```
Sport and role come from device storage
Loaded locally no backend call needed

Data freshness information
App sends request to backend health endpoint
Backend returns when each data type was last synced
App displays "Last synced 2 hours ago"

Cache status
Backend returns how many entries are in cache
App displays the count
```

**Refresh data button:**
```
User taps refresh
App sends request to backend
"Trigger a data sync for NBA right now"

Backend starts the sync job immediately
Returns a job ID

App shows a loading indicator
Polls the backend every 5 seconds
"Is job ID 892 complete?"

When backend reports complete
App refreshes whatever screen the user is on
Shows "Data updated just now"
```

**Change sport or role:**
```
User changes sport or role
App saves new preference to device storage
App navigates back to Home screen
Home screen reads the new preference
Sends fresh requests with new sport filter
Everything updates to show the new sport
```

---

## Story Mode Modal — How It Works

**When user taps Story Mode button:**
```
App knows which module the user is currently on
Injury or Decisions or Momentum
App knows which sport is selected
App knows the user's role
App knows what entity is being viewed
Player ID or coach ID or null

App sends request to backend
"Generate a story for
injury module NBA analyst role player 237"

Backend checks StoryLogs table
Has this exact combination been generated recently?
Within the last hour?

If yes returns the cached story immediately

If no backend collects all relevant data
For injury → gets player risk profile
For decisions → gets coach scorecard
For momentum → gets season analysis

Sends all data to Python story generator
Python builds the narrative paragraph
Using templates matched to the role
Returns story text and headline

Backend saves to StoryLogs
Returns to app
```

**The share button:**
```
User taps share
App opens the native iOS or Android share sheet
User can send the story text via
Messages iMessage WhatsApp email etc
This is a native device feature
No backend involvement
```

---

## How Role Affects Every Screen

**Role is saved in device storage**
**Every screen reads it on load**
**It affects display but never changes the backend request**

```
Trainer role
├── Injury tab is the default landing tab
├── Statistics sections visible everywhere
├── Medical language used in explanations
└── Export PDF button always prominent

Coach role
├── Decisions tab is the default
├── Momentum timeout optimizer highlighted on home
└── Process vs outcome explanation always visible

Analyst role
├── All statistical details visible
├── p-values confidence intervals shown
└── Full data tables not simplified cards

Fan role
├── All statistics sections hidden
├── Plain English only
├── Story mode explanations shown prominently
└── Jargon replaced with simple language
```

---

## How Sport Selection Affects Every Screen

**Sport is saved in device storage**
**Every backend request includes the sport filter**

```
User changes sport from NBA to NFL

Every screen that loads after this
sends requests filtered to NFL

Injury alerts → shows NFL players only
Coach leaderboard → shows NFL coaches only
Momentum → shows NFL momentum verdict
Recent games → shows NFL games only

The backend has data for all sports
The app filter determines what gets returned
```

---

## Data Freshness — What The App Does When Data Is Old

**Every response from the backend includes a timestamp**
**App reads this and decides how to communicate it**

```
Data less than 1 hour old
→ Show normally, no special indication

Data 1 to 6 hours old
→ Show normally
→ Small gray text "Updated X hours ago"

Data 6 to 24 hours old
→ Show with yellow banner
→ "This data may be outdated. Pull to refresh."

Data older than 24 hours
→ Show with orange banner
→ "Showing data from yesterday. Tap to refresh."

Data older than 48 hours
→ Show with red banner
→ "Data is significantly outdated. Please refresh."
```

---

## What Happens When Things Go Wrong

**Backend is unreachable:**
```
App shows whatever data it loaded last time
In a local cache stored on the device
With a banner explaining it is offline data
Every request silently retries every 30 seconds
When backend comes back
Banner disappears and data refreshes automatically
```

**Python ML service is down:**
```
App does not know or care about this directly
It only talks to Node.js
Node.js handles the Python failure internally
Returns last known computed scores from its database
With a small note "Last computed X hours ago"
App displays that note in the UI
```

**A specific request fails:**
```
App shows an error state for that specific section
Other sections of the screen still work
For example if risk score fails to load
The chart shows an error placeholder
But the player info still displays
The screen does not go blank entirely
```

**Sports API is down:**
```
Again app does not know directly
Backend serves data from its database
Data is from last successful sync
Backend includes the lastSynced timestamp
App displays it as "showing data from X hours ago"
```

---

## Complete Data Journey — One Full Example

**Scenario: User opens app and taps LeBron James to see his injury risk**

```
Step 1 — User taps search icon
App opens search screen
Keyboard appears

Step 2 — User types "lebron"
App sends to backend
"Search players matching lebron in NBA"
Backend checks memory cache for this query
Cache hit → returns in 8ms
Result → LeBron James, Lakers, SF, player ID 237

Step 3 — User taps LeBron in results
App navigates to Player Risk Screen
Passes player ID 237

Step 4 — Player Risk Screen loads
App sends two requests simultaneously
Request A → "Full risk profile for player 237"
Request B → "Last 60 days of risk history for player 237"

Step 5 — Backend processes Request A
Checks InjuryRiskScores table
Finds record for player 237 where isLatest is true
Checks if computedAt is within 6 hours
It is → returns it immediately
Risk score 68 zone red trigger "minutes"
z-score 2.3 baseline 28.5 recent 36.1
explanation "LeBron has played 27% more minutes
than his personal average over the last 5 games"
Plus array of last 21 game logs

Step 6 — Backend processes Request B
Queries InjuryRiskScores for player 237
Last 60 days of records
Returns array of date and riskScore pairs

Step 7 — App receives both responses
Renders the risk score circle with 68 in red
Renders "HIGH RISK" label
Renders the explanation paragraph
Feeds game logs to workload chart
Chart draws the minutes per game line
Red highlighted sections where spike occurred
Feeds risk history to smaller trend chart

Step 8 — User sees everything
All in under 800 milliseconds total
From tap to full screen loaded
```

---

## Summary — The Integration In One Paragraph

```
The React Native app is a display layer
It knows nothing about sports statistics
It cannot compute anything on its own
Every piece of intelligence comes from the backend

User preferences live on the device
Sport selection and role selection
guide every request the app makes

The Node backend is the brain
It decides what data to fetch
what to cache and what to compute
It talks to the sports APIs
It talks to the Python ML service
It stores everything in SQLite

The Python service is the mathematician
It runs z-scores for injury risk
Expected value models for decisions
Cox hazard models for momentum
Returns pure numbers and explanations

Data flows in one direction
Sports world → Sports APIs → Node backend
→ Python ML → back to Node
→ SQLite storage → cached responses
→ App display → User understanding

The whole system is designed so that
if any one piece goes wrong
the others keep working
and the user always sees something useful
```