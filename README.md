# Hood to Coast Planner (Next.js + Neon Postgres)

Production-ready foundation for a collaborative relay-race planning spreadsheet with 36 legs, role-gated editing, persisted state, and relay timing calculations.

## Stack

- Next.js (App Router) + TypeScript
- Neon serverless driver (`@neondatabase/serverless`)
- Luxon for timezone-safe LA time conversions
- Route Handlers for API

Database URL resolution in code:
- Primary: `POSTGRES_URL`
- Fallback: `DATABASE_URL`

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill values:
```bash
cp .env.example .env.local
```

3. Create database schema:
```bash
psql "$POSTGRES_URL" -f db/schema.sql
```

4. Seed baseline data:
```bash
npm run seed
```

5. Start development server:
```bash
npm run dev
```

## Deploy to Vercel

1. Push repository.
2. Import project in Vercel.
3. Add Postgres integration and env vars (`SITE_PASSWORD`, `ADMIN_PASSWORD`, DB vars, optional `AUTH_COOKIE_SECRET`).
   - Set `POSTGRES_URL` (recommended in this repo). `DATABASE_URL` is supported as fallback.
4. Run schema and seed once against production DB.
5. Deploy.

## Authentication + Permissions

- `SITE_PASSWORD` set:
  - All pages and APIs require login via `/login`.
  - Signed `httpOnly` cookie `site_auth` is required.
- `ADMIN_PASSWORD` set:
  - Admin login at `/admin/login` sets signed `httpOnly` `admin_auth`.

Public editor can update:
- `race_start_time`
- `finish_time`
- runner default pace
- leg pace override
- actual leg start time

Admin can additionally update:
- runner names
- leg metadata (mileage/elevation/exchange location)

## API Endpoints

- `GET /api/table`
- `PATCH /api/config`
- `PATCH /api/runners/:runner_number`
- `PATCH /api/legs/:leg` (admin)
- `PATCH /api/leg-inputs/:leg`

## Relay Timing Logic

- Runner assignment:
  - leg `n` uses runner `((n-1) % 12) + 1`
- Effective estimated pace:
  - `COALESCE(leg_override, runner_default)`
- Column J (Initial):
  - `J1 = race_start_time`
  - `J[n] = race_start_time + SUM(estimated durations before n)`
- Column K (Updated):
  - If no actual starts, `K = J`
  - If actual starts exist, latest actual leg anchors projection forward
  - Actual rows display actual times
- Actual durations:
  - Legs 1..35: `L[n+1] - L[n]`
  - Leg 36: `finish_time - L36`
- Van stint totals (rows 6,12,18,24,30,36):
  - Estimated = sum prior 6 estimated durations
  - Actual = sum prior 6 actual durations if complete

## Timezone Behavior

- Store timestamps in UTC (`timestamptz`).
- Display/input in `America/Los_Angeles` using Luxon helpers in `/lib/time.ts`.
- Helpers:
  - `parseLA_datetimeLocalToUTCISOString()`
  - `formatUTCISOStringToLA_datetimeLocal()`
  - `formatUTCISOStringToLA_friendly()`

## UX Details Implemented

- Inline save on blur / Enter
- Optimistic local updates with table refresh
- Next upcoming leg highlight
- Estimated pace override indicator
- Toggle visibility for Column J
- Conditional formatting rules in `/lib/formatRules.ts`
- Reusable heatmap gradients in `/lib/heatmap.ts`

## Known Limitations

- Collaborative editing is last-write-wins (no CRDT/live cursor).
- No audit/version history yet.
- No websocket live push; clients refresh table on edits.
