# NITBox — Numbers in the Box

Football analytics platform focused on the 60 most important national teams in the world.
Data-driven insights powered by API-Football v3, stored in a relational 3NF database, and served through a RESTful API.

---

## Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Frontend | Next.js 14 (App Router), TypeScript           |
| Backend  | NestJS 10, TypeScript, Prisma ORM             |
| ML       | FastAPI, Python 3.11                          |
| Database | PostgreSQL 16                                 |
| Monorepo | Turborepo + npm workspaces                    |
| Data     | API-Football v3 (api-sports.io)               |

---

## Project Structure

```
nitbox/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # 23-model Prisma schema (3NF)
│   │   │   ├── schema.sql      # DDL for DataGrip / visualization
│   │   │   └── seed/
│   │   │       ├── index.ts    # Seed orchestrator
│   │   │       ├── api.ts      # API-Football HTTP client
│   │   │       ├── config.ts   # 60 teams + 12 competitions config
│   │   │       └── seeders/
│   │   │           ├── 01-static.ts        # Confederations + countries
│   │   │           ├── 02-teams.ts         # National teams
│   │   │           ├── 03-competitions.ts  # Competitions + seasons
│   │   │           ├── 04-fixtures.ts      # Matches + stats + events
│   │   │           ├── 05-players.ts       # Players + squads
│   │   │           └── 06-standings.ts     # Standings + team season stats
│   │   └── src/
│   │       ├── controllers/    # Input validation + HTTP layer
│   │       ├── routes/         # NestJS modules per resource
│   │       └── services/       # Business logic + Prisma queries
│   ├── web/                    # Next.js frontend
│   └── ml/                     # FastAPI ML service
└── packages/
    └── types/                  # Shared TypeScript types
```

---

## Prerequisites

- Node.js 22 (`nvm use 22` — Prisma 5.x is incompatible with Node 24)
- PostgreSQL 16
- npm 10+

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-username/nitbox.git
cd nitbox
npm install
```

### 2. Environment variables

Create `apps/api/.env`:

```env
DATABASE_URL="postgresql://<user>@localhost:5432/nitbox"
API_FOOTBALL_KEY="your_api_football_key"
```

### 3. Create the database

```bash
createdb nitbox
```

### 4. Apply schema

```bash
cd apps/api
npx prisma db push
```

---

## Database

The schema has 23 models organized around the following hierarchy:

```
Confederation → Country → NationalTeam
Competition → CompetitionSeason → CompetitionGroup
Match → MatchTeamStatistics / MatchEvent / MatchLineup → LineupPlayer
Player → PlayerMatchStats / PlayerSeasonStats
TeamSeasonStats / Standing / Trophy / PlayerInjury
```

All API-mapped models include `apiFootballId Int @unique` for sync tracking.
`isoAlpha3` is the unique country code (`isoAlpha2` is not unique — England, Scotland, and Wales all share `GB`).

---

## Seeding

The seed pipeline fetches data from API-Football v3.
The free plan allows 100 requests/day at 10 req/min.

Seeders are fully idempotent — safe to re-run when the daily limit resets.
Run order respects foreign key constraints:

```
01-static → 02-teams → 03-competitions → 04-fixtures → 05-players → 06-standings
```

### Run all seeders

```bash
cd apps/api
npm run seed
```

### Run individual phases

```bash
npm run seed:static        # Confederations + countries (no API calls)
npm run seed:teams         # 60 national teams
npm run seed:competitions  # 12 competitions + seasons 2021-2024
npm run seed:players       # Players via squads endpoint
npm run seed:fixtures      # Matches + statistics + events
npm run seed:standings     # Standings + team season stats
```

> If the daily API limit is reached, the process exits cleanly (`DailyLimitError`) and all progress up to that point is saved. Resume with the same command the next day.

### Competitions covered

| Competition                          | Confederation |
|--------------------------------------|---------------|
| FIFA World Cup                       | FIFA          |
| UEFA European Championship           | UEFA          |
| Copa America                         | CONMEBOL      |
| Africa Cup of Nations (AFCON)        | CAF           |
| AFC Asian Cup                        | AFC           |
| CONCACAF Gold Cup                    | CONCACAF      |
| UEFA Nations League                  | UEFA          |
| WCQ — CONMEBOL / UEFA / CAF / AFC / CONCACAF | regional |

Seasons: 2021, 2022, 2023, 2024.

---

## Running the API

```bash
cd apps/api
npm run dev
```

The API runs at `http://localhost:3000`.

---

## API Endpoints

### Teams

| Method | Endpoint       | Description              |
|--------|----------------|--------------------------|
| GET    | `/teams`       | List all 60 national teams |
| GET    | `/teams/:id`   | Get a team by DB id      |

### Matches

| Method | Endpoint              | Description                        |
|--------|-----------------------|------------------------------------|
| GET    | `/matches`            | List all matches (optional `?teamId=`) |
| GET    | `/matches/:id`        | Get a match by DB id               |

### Planned endpoints

| Method | Endpoint                                | Description                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/teams/:id/standings`                  | Standings by team               |
| GET    | `/teams/:id/stats`                      | Season stats by team            |
| GET    | `/competitions`                         | List all competitions           |
| GET    | `/competitions/:id/standings`           | Standings for a competition     |
| GET    | `/players/:id`                          | Player profile                  |
| GET    | `/players/:id/stats`                    | Player season stats             |

---

## Development

```bash
# Run all apps in parallel (Turborepo)
npm run dev

# Lint
npm run lint

# Build
npm run build
```

---

## Data Coverage

- 60 national teams across 6 confederations (UEFA 23, CAF 12, AFC 8, CONCACAF 7, CONMEBOL 10)
- 12 competitions including World Cup, continental tournaments, and qualifiers
- Seasons 2021–2024
- Per-match statistics, lineups, events, player stats, and standings
