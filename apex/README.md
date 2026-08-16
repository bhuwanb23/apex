# AQX Sports Intelligence — App

React Native (Expo) frontend for [AQX Sports Intelligence](../README.md) — the display layer for the Injury Risk, Coaching Decisions and Momentum modules. Runs on iOS, Android and the web from one codebase.

## What's here

- **Three tabs** — Injury (default for trainers), Decisions (default for coaches), Momentum — each with detail screens (player/team risk, coach/decision drill-down, game replay, timeout optimizer).
- **Search** across players, teams, coaches and games, with deep links into the right detail screen.
- **Story mode** — generates a plain-English narrative from the live backend data, shareable via the native share sheet.
- **Role-aware UI** — Trainer / Coach / Analyst / Fan changes what's displayed (e.g. Fan hides all statistics), never what's requested.
- **Sport-aware** — NBA / NFL / MLB / NHL selection filters every backend request.
- **Resilient** — loading skeletons/spinners everywhere, proper empty states, per-section error states with retry, pull-to-refresh on every list, and an offline banner that shows cached/demo data with automatic retry.
- **Editable API URL** — switch between localhost and a deployed backend from the Settings screen, no rebuild needed.

## Getting started

```bash
cd apex
npm install
npx expo start          # press "w" for web, or scan the QR code for a device
```

The backend must be running (see the [backend README](../backend/README.md)):

- Web/simulator → http://localhost:8000 (default)
- Physical device → the app auto-detects the dev machine's LAN IP; you can also set it manually in **Settings → API URL**, or override with `EXPO_PUBLIC_API_URL`.

## Login

Mock auth for the demo — use the **"Use demo account"** button on the login screen (email `demo@apex.app`, password `apex1234`). Real auth (JWT/session) is planned; for now this gates the flow so onboarding shows exactly once.

## Structure

```
src/
├── app/                     # file-based routing (expo-router)
│   ├── auth/                #   mock sign-in + demo account
│   ├── onboarding/          #   sport + role selection (shows once)
│   ├── settings/            #   role/sport, API URL, data freshness
│   ├── search/              #   search input + results
│   ├── story.tsx            #   story mode modal
│   └── (tabs)/
│       ├── index.tsx        #   Home (all three modules)
│       ├── injury/          #   dashboard, alerts, player, team
│       ├── decisions/       #   leaderboard, coach, decision, game
│       └── momentum/        #   overview, comparison, replay, timeout
├── components/ui/           # shared UI — screen, cards, skeleton, loading,
│                            #   empty-state, error-state, pills, icons
├── context/                 # auth, onboarding (sport/role), backend connectivity
├── data/live/               # typed API client + per-screen hooks + fallback data
├── hooks/                   # useApiData, usePullRefresh, etc.
├── lib/                     # api.ts (backend URL resolution), storage
└── constants/               # theme, sports, roles
```

## Scripts

| Script            | Purpose                              |
| ----------------- | ------------------------------------ |
| `npm start`       | `expo start`                         |
| `npm run web`     | Start in web mode                    |
| `npm run ios`     | Start + open iOS simulator           |
| `npm run android` | Start + open Android emulator        |
| `npm run lint`    | Expo/ESLint lint                     |
| `node scripts/render-diagrams.mjs` | Re-render the root README's SVG diagrams to PNG |
| `node scripts/e2e-level7.mjs`  | E2E flow in headless Chrome (onboarding → tabs → search → story → role change) |
| `node scripts/perf-load.mjs`   | Cold/warm app-load timing measurement |

See the [root README](../README.md) for architecture diagrams, the full demo guide, and testing docs.
