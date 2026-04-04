<div align="center">
  <img src="apps/web/public/nitbox-full-wordmark.png" alt="NITBox" width="360" />
  <br/><br/>
  <p>Football stats for everyone.</p>
</div>

---

NITBox tracks the 60 most important national teams in the world across 12 competitions and 4 seasons. The goal is to turn raw football data into clear, accessible stories — not tables of numbers, but insights that make sense to any fan.

Starting with national teams, with club data planned for a future phase.

---

## How it works

```
API-Football v3
      │
      │  HTTP (seed pipeline)
      ▼
PostgreSQL 16  ◄──── Prisma ORM ────► NestJS API (REST)
                                             │
                                             │ HTTP
                                      ┌──────┴──────┐
                                      │             │
                                   Next.js        FastAPI
                                  Frontend        ML Service
                                      │
                              Payload CMS
                               (blog admin)
```

Data flows in one direction: API-Football is the source of truth. A seed pipeline fetches and normalizes the data into PostgreSQL. The NestJS API exposes that data to the frontend. The ML service reads from the same database to generate predictive insights. The blog lets us publish the story behind the numbers.

---

## Infrastructure

### Data layer — PostgreSQL + Prisma

A 23-model relational schema designed in 3NF. The hierarchy follows how football is structured:

```
Confederation → Country → NationalTeam
Competition → CompetitionSeason → CompetitionGroup
Match → MatchTeamStatistics / MatchEvent / MatchLineup → LineupPlayer
Player → PlayerMatchStats / PlayerSeasonStats
TeamSeasonStats / Standing / Trophy / PlayerInjury
```

Every API-mapped model stores `apiFootballId` as a unique identifier to make the sync pipeline fully idempotent — seeders can be re-run at any time without creating duplicates.

**Coverage:**
- 60 national teams across 6 confederations (UEFA 23, CONMEBOL 10, CAF 12, AFC 8, CONCACAF 7)
- 12 competitions: World Cup, Euro, Copa America, AFCON, Asian Cup, Gold Cup, Nations League + 5 WCQ zones
- Seasons 2021, 2022, 2023, 2024

---

### Seed pipeline — API-Football v3

Data is fetched via a phased seed pipeline that respects FK constraints and API rate limits (1,500 ms delay, paid plan):

```
01-static              Confederations + countries             no API
02-teams               60 national teams                      1 req/team
03-competitions        12 competitions × 4 seasons            ~48 req
04-fixtures            Matches + lineups + events + stats     variable
05-players             Squad rosters + player profiles        1 req/team
06-standings           League tables + team season stats      variable
07-player-season-stats Aggregated per-season stats            DB only (no API)
08-coaches             Head coach history per team            1 req/team
```

Every seeder checks the DB before making an API call (skip logic). Re-running any phase resumes from where it left off without duplicates.

---

### Backend — NestJS

RESTful API organized around three layers:

- **Routes** — NestJS module definitions per resource
- **Controllers** — input validation and HTTP handling
- **Services** — business logic and Prisma queries

| Endpoint | Description |
|----------|-------------|
| `GET /teams` | All 60 national teams |
| `GET /teams/:id` | Team profile |
| `GET /teams/:id/matches` | Team match history |
| `GET /teams/:id/squad` | Current squad roster |
| `GET /teams/:id/standings` | League table position |
| `GET /teams/:id/stats` | Team season statistics |
| `GET /matches` | Matches (filter by season, competition, status) |
| `GET /matches/live` | All currently live matches |
| `GET /matches/:id` | Match detail |
| `GET /matches/:id/lineups` | Starting XI + bench |
| `GET /matches/:id/events` | Goals, cards, substitutions |
| `GET /matches/:id/players` | Player match statistics |
| `GET /players/:id` | Player profile |
| `GET /players/:id/stats` | Season statistics |
| `GET /players/:id/rating` | ML-computed attribute ratings |
| `GET /standings` | Standings by competition + season |
| `GET /competitions` | All competitions |
| `GET /competitions/:id/seasons` | Seasons per competition |

---

### Frontend — Next.js 14

Dark-theme interface built for readability. The design principle: one number, one story. Not a data dump — each stat is shown with the context that makes it meaningful.

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Hero + live banner + recent matches |
| Live | `/live` | Polling every 30s, countdown timer |
| Player | `/players/[id]` | Profile + hexagonal radar card |
| Blog | `/blog` | Articles from Payload CMS |

**Components:**
- `LiveBanner` — persistent strip showing in-progress matches across all pages
- `HexRadar` — SVG hexagonal radar chart with player photo clipped to center circle, colored fill proportional to each attribute (0–100)
- `PlayerCard` — overall rating badge, position chip, HexRadar, attribute grid

---

### Blog — Payload CMS

A headless CMS running alongside the frontend. Articles are written in a rich-text editor and published via a REST API consumed by Next.js. Each article can be tagged with related teams and linked to real data from the database.

---

### ML — FastAPI (port 3003)

Python service that reads from the same PostgreSQL database. Runs independently — if offline, the API degrades gracefully.

**Player Rating Engine (live)**

Percentile-based ratings computed from `player_season_stats`. For each position group (GK / DEF / MID / ATT), raw composite scores are built from per-90 weighted stats, then ranked via `scipy.stats.percentileofscore` to produce 1–99 ratings:

| Attribute | Outfield formula proxy |
|-----------|----------------------|
| PAC | dribbles/90 + fouls won/90 |
| SHO | goals/90 + shot accuracy + shots/90 |
| PAS | pass accuracy + key passes/90 + assists/90 |
| DRI | dribble success % + dribbles/90 |
| DEF | tackles/90 + interceptions/90 + clearances/90 |
| PHY | minutes per game + discipline + foul rate |

GKs get separate attributes: DIV / HAN / KIC / REF / SPD / POS.

Results are cached in memory for 30 minutes.

| Endpoint | Description |
|----------|-------------|
| `GET /ratings/player/:id` | Single player rating |
| `GET /ratings/batch?ids=1,2,3` | Multiple players |
| `GET /ratings/all?position=ST` | All players, optional filter |
| `POST /ratings/refresh` | Invalidate cache |

**Planned:**
- Match outcome prediction (XGBoost on recent form)
- Offensive / defensive tendency profiling

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | NestJS 10, TypeScript, Prisma ORM |
| CMS | Payload CMS v3 |
| ML | FastAPI, Python 3.11, pandas, scipy |
| Database | PostgreSQL 16 |
| Monorepo | Turborepo + npm workspaces |
| Data source | API-Football v3 |

## Local development

```bash
# 1. API + Web
npm install
npm run dev          # Next.js :3002 · NestJS :3001 · CMS :3000

# 2. ML service
cd apps/ml
source .venv/bin/activate
uvicorn main:app --port 3003 --reload --reload-dir services --reload-dir routers
```

Environment files needed (not committed):

| File | Key variables |
|------|--------------|
| `apps/api/.env` | `DATABASE_URL`, `ML_SERVICE_URL` |
| `apps/ml/.env` | `DATABASE_URL` |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_URL` |
