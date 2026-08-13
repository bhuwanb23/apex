# AQX Sports Intelligence — React Native App Pages Plan

---

## First — Why React Native

```
React Native gives us
├── One codebase for iOS and Android
├── Native feel and performance
├── Real mobile app not a web wrapper
├── Access to device features
│   ├── Haptic feedback on alerts
│   ├── Push notifications for risk alerts
│   └── Share functionality for reports
└── Judges can run on actual phone
    Much more impressive than browser demo
```

---

## App Navigation Structure

```
Two main navigation types

Bottom Tab Navigator (always visible)
├── Home
├── Injury Risk
├── Decisions
└── Momentum

Stack Navigator (inside each tab)
└── Each tab can push deeper screens
    Tab screen → Detail screen → Sub detail screen
```

**Full navigation tree:**
```
Root
│
├── Onboarding Stack (first launch only)
│   ├── Welcome Screen
│   ├── Sport Select Screen
│   └── Role Select Screen
│
├── Bottom Tab Navigator
│   │
│   ├── Home Tab
│   │   └── Home Screen
│   │
│   ├── Injury Tab
│   │   ├── Injury Dashboard Screen
│   │   ├── Player Risk Screen
│   │   ├── Team Risk Screen
│   │   └── League Alerts Screen
│   │
│   ├── Decisions Tab
│   │   ├── Coach Leaderboard Screen
│   │   ├── Coach Detail Screen
│   │   ├── Decision Drill Down Screen
│   │   └── Game Decisions Screen
│   │
│   └── Momentum Tab
│       ├── Momentum Overview Screen
│       ├── Game Replay Screen
│       ├── Sport Comparison Screen
│       └── Timeout Optimizer Screen
│
├── Search Modal (accessible from anywhere)
│   ├── Search Screen
│   └── Search Results Screen
│
└── Settings Stack
    ├── Settings Screen
    ├── Sport Preferences Screen
    └── Role Preferences Screen
```

---

## Total Pages — 20 Screens

```
Onboarding      → 3 screens
Home            → 1 screen
Injury Module   → 4 screens
Decisions Module → 4 screens
Momentum Module  → 4 screens
Search          → 2 screens
Settings        → 3 screens
Shared Modal    → 1 screen (Story Mode)
─────────────────────────────
Total           → 22 screens
```

---

## ONBOARDING STACK — 3 Screens

---

### Screen 1 — Welcome Screen

**Why this screen exists:**
```
First thing a new user sees
Sets the tone and brand
Explains what AQX does in 3 bullet points
Gets user excited before they even log in
```

**What lives on this screen:**
```
Top section
├── AQX logo animated fade in
├── Tagline → "Sports Intelligence. Personalized."
└── Short description → 2 sentences max

Middle section → Three value props
├── Icon + "Know who's at risk before they get hurt"
├── Icon + "Grade every coaching decision on pure logic"
└── Icon + "Find out if momentum is real or just a story"

Bottom section
├── Get Started button → goes to Sport Select
└── Already set up? Skip → goes to Home directly
```

**Why it matters:**
```
Judges see this first
If it looks good they are already impressed
Sets professional tone immediately
```

---

### Screen 2 — Sport Select Screen

**Why this screen exists:**
```
Personalizes the entire experience from the start
The sport selection persists and affects
every module the user sees
```

**What lives on this screen:**
```
Header
└── "Which sport do you follow?"
    Subtext → "You can change this anytime in settings"

Sport cards in a 2x2 grid
├── NBA card with logo and "Basketball"
├── NFL card with logo and "Football"
├── MLB card with logo and "Baseball"
└── NHL card with logo and "Hockey"

Each card
├── Sport logo/icon
├── Sport name
├── One line hook
│   NBA → "30 teams, 450 players tracked"
│   NFL → "4th down decisions graded weekly"
│   MLB → "Pitch by pitch momentum analysis"
│   NHL → "Strongest momentum effect of any sport"
└── Tap to select (highlight border on selection)

Allow multiple selection
Some users follow multiple sports

Continue button at bottom
└── Disabled until at least one selected
```

---

### Screen 3 — Role Select Screen

**Why this screen exists:**
```
The role changes what the app emphasizes
Trainer sees injury front and center
Coach sees decisions and momentum
Fan sees simplified explanations
Analyst sees everything
```

**What lives on this screen:**
```
Header
└── "How will you use AQX?"
    Subtext → "This personalizes your dashboard"

Role cards in a vertical list
├── Athletic Trainer card
│   Icon + Title + "Monitor player workload and injury risk"
│   Highlight → Injury module
│
├── Coach card
│   Icon + Title + "Analyze decisions and momentum"
│   Highlight → Decisions and Momentum modules
│
├── Front Office Analyst card
│   Icon + Title + "Full access to all analytics"
│   Highlight → All three modules
│
└── Fan / Journalist card
    Icon + Title + "Plain English explanations, no jargon"
    Highlight → Simplified views everywhere

Select one only
Not multiple like sports

Continue → Goes to Home
Saves selection to device storage
```

---

## HOME TAB — 1 Screen

---

### Screen 4 — Home Screen

**Why this screen exists:**
```
The daily starting point for every user
Quick snapshot of everything important
Surfaces the most critical info immediately
No digging required
```

**What lives on this screen:**
```
Top bar
├── AQX logo left
├── Current sport selector (tap to change)
│   Shows active sport badge
└── Notification bell right
    Dot if new alerts exist

Greeting section
└── "Good morning, Analyst"
    Date and current season

Quick Stats Bar (horizontal scroll)
├── Red zone players this week
├── Most risky coach decision today
├── Momentum verdict for sport
└── Games analyzed today

Section 1 — Top Risk Alerts
├── Section title "⚠️ Injury Watch"
├── Top 3 red zone players
│   Each shows
│   ├── Player name and team
│   ├── Risk score badge (red number)
│   ├── What triggered the flag
│   └── Tap → goes to Player Risk Screen
└── "See all alerts" link → League Alerts Screen

Section 2 — Decision Quality Spotlight
├── Section title "🧠 Best Decision This Week"
├── One highlighted coach decision
│   Shows coach name, team, what decision
│   Green badge if optimal, red if not
│   Short plain explanation
└── "See full leaderboard" → Coach Leaderboard Screen

Section 3 — Momentum Snapshot
├── Section title "⚡ Momentum Check"
├── Current sport momentum verdict
│   Pill badge → "Momentum is Real" or "Myth"
│   One line explanation
└── "Explore momentum" → Momentum Overview Screen

Section 4 — Recent Games
├── Section title "Last Night's Games"
├── Horizontal scroll of game cards
│   Each game card shows
│   ├── Teams and score
│   ├── Momentum shifts count
│   └── Tap → Game Replay Screen
└── Only shows games from last 48 hours

Bottom area
└── Story Mode button
    "📖 Tell me what's happening today"
    Generates plain English daily summary
    Opens Story Mode Modal
```

**Why home screen is this detailed:**
```
Judges will spend most time on this screen
It surfaces all three modules at once
Shows the platform is unified
Every section is tappable and leads deeper
```

---

## INJURY TAB — 4 Screens

---

### Screen 5 — Injury Dashboard Screen

**Why this screen exists:**
```
Main entry to Module 1
Quick overview of the injury situation
across the whole league or selected team
```

**What lives on this screen:**
```
Top section
├── Sport filter tabs (NBA NFL MLB NHL)
└── View toggle → "League" / "Team"

League view
├── Risk distribution bar
│   Visual bar showing count of
│   Red | Yellow | Green players
├── Top 5 red zone players list
│   Each row shows
│   ├── Player name photo placeholder
│   ├── Team name
│   ├── Risk score 0-100
│   ├── Zone badge colored
│   └── Trigger metric chip
└── "View all 12 red zone players" button

Team view
├── Team search bar
│   Type team name to filter
├── Selected team roster
│   Traffic light style list
│   Every player with their zone color
└── Team summary bar
    Red 2 | Yellow 5 | Green 10

Bottom section both views
└── Last updated time
    "Risk scores updated 2 hours ago"
    Tap to force refresh
```

---

### Screen 6 — Player Risk Screen

**Why this screen exists:**
```
Deep dive into one specific player's risk profile
The most detailed injury view
What an athletic trainer uses daily
```

**What lives on this screen:**
```
Top section (header card)
├── Player name and position
├── Team name and sport
├── Large risk score circle
│   0-100 number in center
│   Colored arc around it (red/yellow/green)
└── Zone label "HIGH RISK"

Explanation card
└── Plain English paragraph
    "Marcus has been playing 31% more minutes
    than his personal average over the last 5 games"

Metrics breakdown section
├── Section title "What triggered this"
└── Each metric as a card
    ├── Metric name "Minutes Played"
    ├── Bar showing baseline vs recent
    │   Gray bar → personal baseline
    │   Colored bar → recent window
    ├── Z-score value
    └── Plain English comparison
        "36.2 min recent vs 28.5 min baseline"

Workload timeline chart
├── Section title "Season Workload"
├── Line chart showing minutes per game
│   Entire season visible
│   Highlighted zones in red/yellow
│   Dots on each game
│   Tap dot → tooltip with game details
└── Toggle between metrics
    Minutes | Distance | Intensity

Risk history section
├── Section title "Risk Trend"
├── Mini line chart
│   Last 60 days of risk scores
│   Shows how risk has changed
└── Notable dates labeled
    When score entered red zone

Back to back games section
└── Calendar style view
    Shows game schedule
    Highlights back to back games
    Shows rest days between

Action bar at bottom
├── Export PDF report button
└── Share button
```

---

### Screen 7 — Team Risk Screen

**Why this screen exists:**
```
An athletic trainer looks at this every morning
See the whole roster health at one glance
Traffic light system for entire team
```

**What lives on this screen:**
```
Header
├── Team name and logo placeholder
├── Sport badge
└── Last updated timestamp

Traffic light summary row
├── Red zone count (large red number)
├── Yellow zone count (yellow number)
└── Green zone count (green number)
Tap any count → filters list below

Filter bar
├── All | Red | Yellow | Green tabs
└── Sort by → Risk Score / Name / Position

Player roster list
├── Each player row
│   ├── Zone color dot on far left
│   ├── Jersey number
│   ├── Player name
│   ├── Position badge
│   ├── Risk score number
│   ├── Trigger metric chip
│   │   "↑ Minutes" or "Back-to-Back"
│   └── Tap → Player Risk Screen
└── Swipe left on row
    Quick action → View full profile

Team risk chart
├── Collapsible section
├── Bar chart showing risk distribution
└── Risk over last 30 days trend

Export section at bottom
└── "Export team report PDF"
    Generates PDF with all player risk scores
```

---

### Screen 8 — League Alerts Screen

**Why this screen exists:**
```
See all high risk players across the entire league
For journalists covering injury reports
For fantasy sports users
For front office scouts
```

**What lives on this screen:**
```
Header
├── Sport tabs
└── Zone filter → Red | Yellow | All

Alert count banner
└── "14 players currently in the red zone"

Sort options
├── Sort by → Risk Score / Team / Position
└── Filter by → Position (PG, SG, SF etc for NBA)

Alert list
├── Each card shows
│   ├── Zone badge (colored background)
│   ├── Player name in large text
│   ├── Team and position
│   ├── Risk score prominent
│   ├── Trigger explanation one line
│   └── How long in this zone
│       "In red zone for 3 days"
└── Tap → Player Risk Screen

Refresh button top right
└── Pull to refresh gesture also works

Empty state
└── "No players in red zone right now"
    Green checkmark illustration
    "All players within normal workload range"
```

---

## DECISIONS TAB — 4 Screens

---

### Screen 9 — Coach Leaderboard Screen

**Why this screen exists:**
```
The flagship view of Module 2
Ranks every coach by decision quality
Immediately visual and conversation starting
```

**What lives on this screen:**
```
Top filter bar
├── Sport selector
├── Season selector
├── Decision type selector
│   All | 4th Down | Timeout | 2-Point
└── Game type → Regular | Playoff | All

Podium section (top 3 coaches)
├── Visual podium for rank 1, 2, 3
│   Each shows
│   ├── Rank number
│   ├── Coach name
│   ├── Team
│   └── EV Rate as large percentage
└── Tap any podium → Coach Detail Screen

Full leaderboard list
├── Rank number
├── Coach name and team
├── EV Rate percentage
│   Color coded
│   Green > 70%
│   Yellow 50-70%
│   Red < 50%
├── Total decisions count
├── Trend arrow → up/down vs last month
└── Tap → Coach Detail Screen

Bottom note
└── "EV Rate measures how often a coach chose
    the statistically optimal decision"
    Info icon for more explanation
```

---

### Screen 10 — Coach Detail Screen

**Why this screen exists:**
```
Deep dive into one coach's decision history
The process vs outcome chart lives here
Most analytically rich screen in Module 2
```

**What lives on this screen:**
```
Coach header card
├── Coach name large
├── Team name
├── Current rank badge
└── EV Rate large percentage

Four stat boxes in a row
├── Total decisions
├── Optimal decisions
├── EV rate
└── Avg EV left on table

Process vs Outcome chart section
├── Section title "Process vs Outcome"
├── 2x2 matrix visualization
│   ┌──────────────┬───────────────┐
│   │ Good Process │ Good Process  │
│   │ Good Outcome │ Bad Outcome   │
│   ├──────────────┼───────────────┤
│   │ Bad Process  │ Bad Process   │
│   │ Good Outcome │ Bad Outcome   │
│   └──────────────┴───────────────┘
│   Each cell shows count and percentage
├── Explanation below matrix
│   "A good outcome does not mean a good decision"
└── Tap cell → filter decisions list below

Decision filter bar
├── All | Optimal | Suboptimal
├── Decision type filter
└── Opponent filter

Decisions list
├── Chronological list most recent first
├── Each decision card
│   ├── Green or red left border
│   ├── Game date and opponent
│   ├── Decision type chip
│   ├── Situation description
│   │   "4th and 2, opp 33yd line, down 3, 4:22 left"
│   ├── What coach chose
│   ├── EV of choice vs best option
│   └── Outcome → what actually happened
└── Tap → Decision Drill Down Screen
```

---

### Screen 11 — Decision Drill Down Screen

**Why this screen exists:**
```
Full detail on one specific coaching decision
Shows every available option and their EVs
The most educational screen in the app
```

**What lives on this screen:**
```
Decision context card
├── Game → Teams and date
├── Situation → All game context in readable format
│   "4th and 2 at the opponent 33 yard line"
│   "Trailing by 3 points"
│   "4 minutes 22 seconds remaining"
│   "2 timeouts available"
└── Win probability before decision
    Large percentage with team context

Decision made section
├── "Coach chose to" label
├── Large action text → "Go For It"
├── EV of this choice as number
└── Optimal badge OR "Not optimal" badge

All options comparison
├── Section title "All Available Options"
├── Options as cards sorted by EV
│   Each option
│   ├── Action name
│   ├── EV value (larger = better)
│   ├── Success probability
│   ├── Win probability if succeeds
│   ├── Win probability if fails
│   └── Best option has gold border
└── Visual bar chart comparing EVs

What happened section
├── "What actually happened"
├── Outcome description
├── Success or failure badge
└── Win probability after this play

Key insight callout
└── Highlighted box
    "This was the correct decision even though
    the play failed. The process was right."
    OR
    "There was a better option available.
    Punting would have had 12% higher EV."
```

---

### Screen 12 — Game Decisions Screen

**Why this screen exists:**
```
See all decisions made in one specific game
Chronological walkthrough of coaching decisions
Good for post-game analysis
```

**What lives on this screen:**
```
Game header
├── Both teams with scores
├── Date and game type
└── Both coaches named

Decision timeline
├── Vertical timeline layout
├── Each decision is a node on the timeline
│   ├── Time in game (Q3 4:22)
│   ├── Coach name and team
│   ├── Decision type badge
│   ├── Action taken
│   ├── Green dot → optimal
│   │   Red dot → suboptimal
│   └── Tap → Decision Drill Down Screen

Game summary card at top
├── Home coach EV rate for this game
├── Away coach EV rate for this game
├── Total decisions count
└── Biggest mistake of the game

Score progression context
└── Thin score line above timeline
    Shows how score changed through game
    Decisions overlay on top of score line
```

---

## MOMENTUM TAB — 4 Screens

---

### Screen 13 — Momentum Overview Screen

**Why this screen exists:**
```
Main entry to Module 3
The statistical verdict on momentum
First screen that answers "is momentum real?"
```

**What lives on this screen:**
```
Sport selector tabs at top

Verdict banner (large and prominent)
├── Sport name
├── Large verdict text
│   "Momentum is a Myth" or "Momentum is Real"
├── Verdict colored background
│   Green → significant effect
│   Gray → not significant
└── p-value and confidence shown small below

Plain explanation card
└── Full paragraph in plain English
    No jargon, readable by anyone
    Different depth per role setting

Statistics section (collapsible for non-analysts)
├── Section title "The Numbers"
├── Hazard Coefficient card
├── P-Value card
├── Confidence Interval card
└── Effect Size card
    Each card has metric name, value,
    and one line plain explanation

Games analyzed context
└── "Based on analysis of 847 games
    from the 2024-25 NBA season"

Quick access row
├── "See a game replay" → Game Replay Screen
├── "Compare sports" → Sport Comparison Screen
└── "Timeout optimizer" → Timeout Optimizer Screen

Story mode button
└── "Explain this to me simply"
    Opens Story Mode Modal for this view
```

---

### Screen 14 — Game Replay Screen

**Why this screen exists:**
```
Most visually impressive screen in the app
Watch momentum change in real time as game unfolds
The interactive scrubber is the wow factor
```

**What lives on this screen:**
```
Game selector section
├── Search bar → find any game
├── Recent games list
└── Date filter

Selected game header
├── Home team vs Away team
├── Final score
└── Date

Momentum chart (main visual)
├── Line chart with two lines
│   Blue line → Home team momentum
│   Orange line → Away team momentum
├── X axis → game time
│   Quarters marked
├── Y axis → momentum score
├── Current position marker
│   Vertical line that user drags
└── Scoring events marked as dots on chart
    Tap dot → see what happened

Scrubber bar below chart
├── Slider the user drags left to right
├── As they drag
│   ├── Vertical line on chart moves
│   ├── Event description updates
│   └── Momentum scores update
└── Play button
    Auto advances the scrubber
    Like playing back the game

Current moment panel
├── Game time label "Q3 - 4:22"
├── Current score
├── Home momentum score
├── Away momentum score
├── Last event description
└── Which team has momentum badge

Peak moments section
├── "Peak Moments" collapsible
├── List of biggest momentum swings
│   ├── When it happened
│   ├── Which team gained momentum
│   └── What caused it
└── Tap → scrubber jumps to that moment

Momentum summary stats
├── Most momentum shifts
├── Longest streak
└── Team that held momentum longest
```

---

### Screen 15 — Sport Comparison Screen

**Why this screen exists:**
```
Side by side comparison of all 4 sports
Shows momentum is strongest in hockey
weakest in baseball
Visual proof of the research
```

**What lives on this screen:**
```
Header
└── "Is momentum real? Depends on the sport."

Sport comparison chart
├── Horizontal bar chart
│   Each sport is one bar
│   Bar length = effect size
│   Color coded by significance
│   Green bar → statistically significant
│   Gray bar → not significant
└── Sports ranked by effect size
    Strongest momentum effect at top

Each sport row below chart
├── Sport logo and name
├── Verdict pill badge
│   "Real" / "Myth" / "Inconclusive"
├── Effect size number
├── P-value
└── Tap → Momentum Overview for that sport

Insight callout box
└── "Hockey shows the strongest momentum effect
    while baseball shows almost none.
    This matches intuitions about sport structure."

Season selector
└── Compare across seasons
    Did momentum effect change year to year?
```

---

### Screen 16 — Timeout Optimizer Screen

**Why this screen exists:**
```
Most practical tool in Module 3
Coaches can use this in real games
Answers the exact question
"Should I call timeout right now?"
```

**What lives on this screen:**
```
Sport selector
└── NFL and NBA only (most timeout decisions)

Input section title
└── "Tell me the situation"

Input sliders and selectors
├── Consecutive opponent scores
│   Slider 0 to 7
│   Shows current value as you slide
│
├── Score difference
│   Slider -20 to +20
│   Shows "Down by 3" or "Up by 7"
│
├── Time remaining
│   Slider for minutes
│   Shows "4:22 remaining"
│
├── Current period
│   Segment selector
│   Q1 | Q2 | Q3 | Q4 | OT
│
└── Timeouts available
    Tap counter +/- 
    Shows 0, 1, 2, or 3

Get Recommendation button
└── Large prominent button
    Pulls from pre-computed scenarios

Recommendation card (appears after button tap)
├── Large YES/NO recommendation
│   Green background → "Call Timeout"
│   Red background → "Don't Call Timeout"
├── Probability comparison
│   "Stop probability WITH timeout → 67%"
│   "Stop probability WITHOUT → 54%"
│   Visual bar comparison
├── Difference highlight
│   "+13% better with timeout"
└── Plain English explanation
    "After 3+ consecutive scores with under
    5 minutes remaining in Q4, calling timeout
    has historically improved stop probability
    by 13%. Recommend calling timeout."

Confidence level
└── "High confidence — based on 847 similar situations"

Clear and try another button
└── Resets inputs for new scenario
```

---

## SEARCH — 2 Screens

---

### Screen 17 — Search Screen

**Why this screen exists:**
```
Quick access to any player, team, or coach
Available from anywhere in the app
Floating action button or header icon
```

**What lives on this screen:**
```
Search bar (auto focused)
└── Keyboard appears immediately on open

Recent searches
└── Last 5 searches stored locally
    Tap to repeat search quickly

Quick suggestions
├── "Popular right now"
└── Shows most viewed players today

Category tabs
└── Players | Teams | Coaches | Games
    Tap to limit search scope
```

---

### Screen 18 — Search Results Screen

**Why this screen exists:**
```
Shows results as user types
Autocomplete in real time
Routes to correct detail screen based on result type
```

**What lives on this screen:**
```
Search bar (still active, stays focused)

Results grouped by type
├── Players section
│   ├── Player name
│   ├── Team and position
│   ├── Current risk zone dot
│   └── Tap → Player Risk Screen
│
├── Teams section
│   ├── Team name and sport
│   └── Tap → Team Risk Screen
│
├── Coaches section
│   ├── Coach name and team
│   └── Tap → Coach Detail Screen
│
└── Games section
    ├── Teams and date
    └── Tap → Game Decisions or Game Replay

Empty state
└── "No results for {query}"
    Suggestions to try different search
```

---

## SETTINGS — 3 Screens

---

### Screen 19 — Settings Screen

**Why this screen exists:**
```
User preferences and app configuration
Sport and role can be changed here
Debug info visible here for judges
```

**What lives on this screen:**
```
Profile section
├── Current role display with icon
└── "Change role" → Role Preferences Screen

Preferences section
├── Sport preferences → Sport Preferences Screen
├── Default module → which tab opens first
└── Story mode language → Simple / Technical

Data section
├── Last data sync time
├── "Refresh data now" button
├── Cache status (how many entries)
└── "Clear cache" button

App section
├── Version number
├── Backend URL (configurable for demo)
├── API health status dot
│   Green → all services running
│   Yellow → degraded
│   Red → issues detected
└── View system health → Opens health detail modal

About section
├── What is AQX
├── Data sources used
└── Methodology explanation links
```

---

### Screen 20 — Sport Preferences Screen

**Why this screen exists:**
```
Change which sports are active
Same as onboarding sport select
But accessible anytime
```

**What lives on this screen:**
```
Same layout as onboarding Sport Select Screen
Shows currently selected sports highlighted
Toggle sports on or off
Save changes button
```

---

### Screen 21 — Role Preferences Screen

**Why this screen exists:**
```
Change role after onboarding
User's situation may change
New user selected wrong role
```

**What lives on this screen:**
```
Same layout as onboarding Role Select Screen
Current role highlighted
Select new role
Save → updates globally, app reconfigures
```

---

## SHARED MODAL — 1 Screen

---

### Screen 22 — Story Mode Modal

**Why this screen exists:**
```
Available from Home and all module screens
Generates plain English summary of current view
The narrative layer that makes data human
```

**What lives on this screen:**
```
Modal slides up from bottom
Semi-transparent overlay behind

Header
├── "📖 AQX Story Mode"
└── Close X button

Headline text (bold, large)
└── One line headline like
    "LeBron James is at high injury risk this week"

Story paragraph
└── 3-4 sentences in plain English
    Reads like a sports analyst wrote it
    Role-appropriate language

Key metrics highlighted
└── Numbers pulled out as chips
    "68/100 risk score"
    "31% above baseline"
    "5 consecutive games"

Source note at bottom
└── "Generated from data updated 2 hours ago"

Action buttons
├── Share story → Native share sheet
└── Read more → Goes to relevant detail screen

Generated by badge
└── "template" or "AI enhanced"
    Small badge in corner
```

---

## Page Priority Order — Build Sequence

```
Phase 1 — Core skeleton
├── Screen 4  → Home Screen
├── Screen 5  → Injury Dashboard
├── Screen 9  → Coach Leaderboard
└── Screen 13 → Momentum Overview

Phase 2 — Onboarding
├── Screen 1  → Welcome
├── Screen 2  → Sport Select
└── Screen 3  → Role Select

Phase 3 — Injury module depth
├── Screen 6  → Player Risk
├── Screen 7  → Team Risk
└── Screen 8  → League Alerts

Phase 4 — Decisions module depth
├── Screen 10 → Coach Detail
├── Screen 11 → Decision Drill Down
└── Screen 12 → Game Decisions

Phase 5 — Momentum module depth
├── Screen 14 → Game Replay
├── Screen 15 → Sport Comparison
└── Screen 16 → Timeout Optimizer

Phase 6 — Search and navigation
├── Screen 17 → Search Screen
└── Screen 18 → Search Results

Phase 7 — Settings and story
├── Screen 19 → Settings
├── Screen 20 → Sport Preferences
├── Screen 21 → Role Preferences
└── Screen 22 → Story Mode Modal
```

---

## Summary Table — All 22 Screens

| Screen | Name | Module | Priority |
|---|---|---|---|
| 1 | Welcome | Onboarding | Phase 2 |
| 2 | Sport Select | Onboarding | Phase 2 |
| 3 | Role Select | Onboarding | Phase 2 |
| 4 | Home | Home | Phase 1 |
| 5 | Injury Dashboard | Injury | Phase 1 |
| 6 | Player Risk | Injury | Phase 3 |
| 7 | Team Risk | Injury | Phase 3 |
| 8 | League Alerts | Injury | Phase 3 |
| 9 | Coach Leaderboard | Decisions | Phase 1 |
| 10 | Coach Detail | Decisions | Phase 4 |
| 11 | Decision Drill Down | Decisions | Phase 4 |
| 12 | Game Decisions | Decisions | Phase 4 |
| 13 | Momentum Overview | Momentum | Phase 1 |
| 14 | Game Replay | Momentum | Phase 5 |
| 15 | Sport Comparison | Momentum | Phase 5 |
| 16 | Timeout Optimizer | Momentum | Phase 5 |
| 17 | Search | Search | Phase 6 |
| 18 | Search Results | Search | Phase 6 |
| 19 | Settings | Settings | Phase 7 |
| 20 | Sport Preferences | Settings | Phase 7 |
| 21 | Role Preferences | Settings | Phase 7 |
| 22 | Story Mode Modal | Shared | Phase 7 |

---

## What Makes This App Plan Winning

```
Every screen has a clear purpose
No screen exists without a reason
Every module has exactly the right depth

For judges
├── Home screen shows everything at a glance
├── Each module has 4 screens of depth
├── Onboarding sets expectations immediately
└── Story mode makes data accessible to anyone

For real users
├── Trainers live in Screens 5, 6, 7
├── Coaches live in Screens 9, 10, 16
├── Analysts explore everything
└── Fans understand through story mode

For the demo
├── Start on Welcome (impressive brand)
├── Select NBA and Analyst
├── Land on Home (everything visible)
├── Tap a red zone player (Player Risk)
├── Tap Coach Leaderboard (rank visible)
├── Tap Momentum (verdict card)
└── Tap Story Mode (impressive finish)
```

**22 screens. Every one justified. Every one connected.**
**This is a complete product not a demo.**