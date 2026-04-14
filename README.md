# Workout tracker

Personal planner for lifts, runs, bikes, and swims — internal **weight** log, **TanStack Start**, **Nitro**, **SQLite** (Drizzle), **Strava** OAuth, and **Hevy** API.

## Setup

1. Copy `.env.example` to `.env` and fill values (see comments in the file). Sign-in is Strava-only via OAuth; the allowlisted athlete id is in `src/lib/strava/allowed-athlete.ts`.
2. `bun install`
3. `bun run db:push` — create the SQLite DB
4. `bun run dev` — http://localhost:3000

After adding or renaming files under `src/routes/`, run `bun run routes:generate` so `routeTree.gen.ts` stays in sync.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Vite dev server (TSS + Nitro) |
| `bun run build` | Production build + `tsc` |
| `bun run start` | Run Nitro output (`.output/server/index.mjs`) |
| `bun run lint` | Biome check |
| `bun run routes:generate` | Regenerate TanStack Router route tree |
