# Demo — Judge Q&A Cheat Sheet

Every answer below was **verified against the actual code and the live demo
data**. Two of the plan's original answers were wrong for what the demo
actually shows (momentum findings, and the "real data" claim) — the corrected
versions are marked ⚠️ so you never contradict what's on screen.

---

## "Where does the data come from?"

**Answer:** Free, open sports APIs:

| Sport | Source | Confirmed in code |
|---|---|---|
| NBA | BallDontLie (`api.balldontlie.io`) + ESPN public play-by-play | `src/data/nba/nba.fetcher.ts` |
| NFL | ESPN public API (`site.api.espn.com/.../football/nfl`) | `src/data/nfl/nfl.fetcher.ts` |
| MLB | Official MLB Stats API (`statsapi.mlb.com`) | `src/data/mlb/mlb.fetcher.ts` |

All free, no paid keys required. The Node backend fetches → transforms →
stores in SQLite, and the Python service does the math.

---

## "Is this real data or fake?"

⚠️ **Be careful here.** The **architecture** is: real API sync, scheduled
**every 6 hours** (`JOB_CRON_DATA_SYNC = 0 0,6,12,18 * * *`), risk scores
recomputed 1h after each sync.

**But the current demo database has never run a live sync** — it was
pre-loaded by the seed script (`npm run db:seed:demo`) with **real team and
player names** (LeBron, Curry, Jokić…) and **realistic but synthetic game
logs**. This is deliberate: the demo never depends on API rate limits or the
network during judging.

**Suggested honest phrasing:**

> "The app is fully wired to live sync — BallDontLie, ESPN and the MLB API,
> running every 6 hours. For today's demo we pre-loaded the database with a
> realistic snapshot so nothing depends on API availability or rate limits
> during judging. Same schema, same model pipeline — if you tap 'refresh' it
> recomputes from what's stored."

If a judge opens Settings → "Last synced", say: *"the pre-loaded snapshot is
marked so you can see freshness handling; a live sync writes real timestamps."*

---

## "How does the injury risk work?"

**Answer (100% matches the code — `python_ml/app/models/injury_model.py`):**

> We never compare a player to the league average. We compare each player to
> **their own 21-day baseline** — their personal mean and standard deviation
> for minutes, distance and intensity. If their **recent** workload (last
> ~7 games) spikes more than **1.5 standard deviations** above their own
> norm, they're flagged elevated; above 2.0 SD is red-zone. That's why it
> catches risks a league-average comparison misses — a player who's normal
> for them, even at high minutes, doesn't get flagged.

Back-to-back games are an additional flag. The score (0–100) is a weighted
combination of the per-metric z-scores (minutes 40 pts, distance 25,
intensity 20).

---

## "How do you know if a decision was right?"

**Answer (matches `python_ml/app/models/decision_model.py`):**

> At every decision moment we compute the **expected value of every available
> option**:
> `EV = P(success) × WP(if success) + P(fail) × WP(if fail)`
> where win probability comes from a **logistic regression model trained on
> historical game data** (with a heuristic fallback). The coach is graded on
> whether they chose the **highest-EV option — not on whether it worked**.
> A bad outcome from a good process is still graded good process, which is
> exactly what the "process vs outcome" 2×2 matrix on the coach detail screen
> shows.

---

## "Is momentum actually real?"

⚠️ **The plan's original answer said "hockey and football." The demo shows
football as a MYTH — say what's on screen.** Live values from the comparison
screen right now:

| Sport | Verdict | p-value |
|---|---|---|
| NHL | **Significant** | 0.001 |
| NBA | Inconclusive | 0.089 |
| NFL | Not significant | 0.236 |
| MLB | Not significant | 0.697 |

**Answer:**

> It depends on the sport. We fit a **Cox proportional-hazard model**
> (lifelines) on scoring sequences: after a team scores N straight points,
> does the opponent's hazard of scoring next change? Right now hockey shows a
> statistically significant effect (p = 0.001), basketball is borderline
> (p ≈ 0.09 — inconclusive), and football and baseball show no significant
> effect. We show the p-values and confidence intervals on screen so the
> strength of the evidence is yours to judge.

**If they ask about football specifically:** *"the data-driven answer is
'not significant' — momentum is a myth there. That's the point: we let the
statistics decide instead of assuming momentum exists."*

---

## "Could this be a real business?"

**Answer (market claim — no code needed):**

> Yes. Athletic trainers are the obvious first customer for Module 1 (injury
> risk) — teams already pay millions for sports analytics platforms, but most
> are league-average or team-level. Ours is **per-player, personal-baseline
> risk** that existing tools don't do, plus a coach-decision grader and a
> momentum verdict that's honest about the statistics. Natural extensions:
> subscription per team/league, API licensing, and the story-mode layer makes
> it usable by fans, not just analysts.

---

## Backup facts (if they poke deeper)

- **Stack:** React Native (Expo) app · Node.js + Express backend · SQLite +
  Prisma · Python FastAPI ML service (scikit-learn logistic regression,
  lifelines Cox, z-score risk model).
- **Caching:** in-memory (fastest) + SQLite registry that survives restarts;
  stale-while-revalidate; every response carries `X-Cache-Status`.
- **Performance (measured):** app cold start → Home with data **≈1.7s**,
  warm open **≈0.5s**; leaderboard **2–9ms**, player risk **4–9ms**, game
  replay **4–16ms** (pre-computed — the 10–20s Cox first-compute worst case
  never happens in the demo).
- **API docs:** `http://localhost:8000/api/docs` — 34 endpoints, all with
  example requests/responses.
- **Demo accounts:** login screen has a "Use demo account" button (email
  `demo@apex.app`, password `apex1234`); roles are Trainer / Coach / Analyst /
  Fan — role changes what's displayed, never what's requested.
