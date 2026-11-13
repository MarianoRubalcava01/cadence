# Cadence — real multi-user fitness app

A complete, deployable Strava-style web app: live GPS recording, a real social feed
with kudos and comments, segments and leaderboards, route planning, training analytics,
challenges, clubs, gear tracking, and Beacon live-location sharing.

**Stack:** React 19 + Vite + TypeScript, Supabase (Postgres, Auth, Realtime, Storage),
Leaflet + OpenStreetMap for maps, deployable to Vercel.

**No mock data.** The database seeds nothing. Every new account starts with an empty log.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project. Note the project URL
   and the `anon` public key (Project Settings → API).
2. Open the SQL Editor, paste the contents of
   `supabase/migrations/001_strava_plus.sql`, and run it. It creates all tables, Row Level
   Security policies, the auto-profile trigger, the `activity-photos` storage bucket, and
   Realtime for Beacon.
   - The migration is idempotent for policies and Realtime; re-running it is safe.
3. Auth settings (Authentication → URL Configuration):
   - **Site URL:** your deployed app URL (for example `https://cadence-chi-bice.vercel.app`).
     Add `http://localhost:5173` as an additional redirect URL for local development.
   - Email confirmations are on by default. New sign-ups must confirm their email before
     signing in. You can turn confirmation off under Authentication → Providers → Email
     while testing.
4. The app reads only two environment variables. Never commit real keys:
   - `VITE_SUPABASE_URL` — your project URL, e.g. `https://abcdefghijklm.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — your `anon` public key (safe to expose in the browser;
     Row Level Security enforces access)

## 2. Run locally

```bash
cd cadence
cp .env.example .env
# edit .env with your real Supabase URL and anon key
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (typecheck + Vite)
```

Live GPS recording requires **HTTPS and location permission**. `localhost` counts as a
secure context, so recording works locally; on a phone, use the deployed HTTPS URL.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo (or use `vercel` CLI: `npm i -g vercel && vercel`).
2. In Vercel: **Add New → Project → Import** the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output directory `dist`
   (already set in `vercel.json`).
4. Add environment variables (same names as `.env`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Then set the Supabase Site URL (step 1.3) to your Vercel domain.

## Features

| Area | What is built |
|---|---|
| Auth | Email sign-up / sign-in, profiles with name, avatar, bio, sign out. Profile rows are created automatically by a database trigger. |
| Live recording | `Record` tab uses `navigator.geolocation.watchPosition`: live time, distance, current/average pace and speed, elevation gain, route drawing live on a map, splits per km/mi with audio cues, auto-pause after 15 s without movement, pause/resume, finish and save to the shared database. |
| Activities | 30+ sport types, manual entry, edit/delete your own, photos (Supabase Storage), notes, gear assignment, privacy (public / followers / only me), CSV export. |
| Feed | Real users' public activities and athletes you follow, with kudos and comments. |
| Segments | Create segments from your GPS routes; leaderboards across all users, personal records, Local Legend (most efforts in 90 days), live segment alerts while recording. |
| Routes | Leaflet route planner: tap to drop waypoints, snap-to-road via the public OSRM demo server (falls back to straight lines), suggested loops by target distance, saved routes. |
| Training | Training-log calendar, Fitness & Freshness (CTL/ATL/TSB), Relative Effort, 8-week training load, monthly trend, matched activities (same route, compared), goals, training plans with weekly progression, Year in Sport recap, personal heatmap. |
| Challenges | Create monthly challenges (distance, elevation, activities, time), join/leave, live progress, completion badges. |
| Clubs | Create/join clubs, member lists, club feed, 4-week distance leaderboard. |
| Gear | Gear locker; mileage accumulates from assigned activities; retirement progress and warnings. |
| Beacon | During a recording, share a live link. Anyone with the link watches your position update in real time via Supabase Realtime — no sign-in needed to view. |
| Plus | Weekly goal ring, day streak, 14-day grid, Cadence Analytics (Fitness Score, sport breakdown, PRs), Cadence Coach (rule-based insights computed from your real totals), km/mi toggle, light/dark themes. |

## What the app cannot do on its own

- **Watch sync:** Garmin/Apple Watch uploads are not included; activities come from the
  phone GPS or manual entry. A watch can export a GPX/FIT file, but there is no importer yet.
- **Road snapping** uses the public OSRM demo server (`router.project-osrm.org`). It is
  rate-limited and meant for demos; for heavy use, run your own OSRM instance and change
  the URL in `src/views/RoutesView.tsx`.
- **Email sending** is Supabase Auth's built-in confirmation mail. Custom email templates
  are configured in the Supabase dashboard, not in this repo.
- **Live GPS, Beacon, and Realtime** need a real Supabase project and a real phone with
  GPS. They cannot be verified from a desktop build alone.

## Project layout

```
src/
  main.tsx            entry point
  App.tsx             auth gate, navigation, theme/unit toggles
  index.css           Strava-orange, mobile-first styles
  lib/
    supabase.ts       client (env vars only, never hardcoded keys)
    types.ts          shared types, 30+ sports, MET table
    utils.ts          geo math, pace/speed, calories, CTL/ATL/TSB, CSV
  components/
    AuthView.tsx      sign in / sign up
    BeaconView.tsx    public live-tracking viewer (Realtime)
    ActivityCard.tsx  feed card: map sparkline, stats, kudos, comments
    MapView.tsx       Leaflet wrapper + SVG route sparkline
  views/
    HomeView.tsx      goal ring, streak, 14-day grid, recent activities
    FeedView.tsx      everyone / following feed
    RecordView.tsx    live GPS recording + Beacon + live segments
    ActivitiesView.tsx  my log, manual entry, photos, CSV export
    AnalyticsView.tsx   Cadence Analytics, training log, Year in Sport, heatmap
    SegmentsView.tsx  create segments, leaderboards, Local Legend
    RoutesView.tsx    planner, OSRM snap, suggested loops, saved routes
    ChallengesView.tsx  monthly challenges
    ClubsView.tsx     clubs, leaderboards, club feed
    GearView.tsx      gear locker
    GoalsView.tsx     goals + training plans
    ProfileView.tsx   profile edit, follow/unfollow, followers
supabase/migrations/001_strava_plus.sql
```

## Security notes

- Row Level Security is on for every table. Public activities are readable by anyone;
  followers-only activities are readable by followers; private activities only by the owner.
  Only owners can edit or delete their own rows.
- The `anon` key is public by design. Never put the Supabase `service_role` key in this
  app or in any client-side code.

## Production

Live at https://cadence-chi-bice.vercel.app (Vercel, Hobby). Vercel deploys
automatically on every push to `main`.
