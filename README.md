<div align="center">
  <img src="apps/web/public/nitbox-full-wordmark.png" alt="NITBox" width="360" />
  <br/><br/>
  <p>Football analytics for everyone, not just analysts.</p>
</div>

---

NITBox tracks the 60 most important national teams in the world across 12 competitions and 4 seasons. The goal is to turn raw football data into clear, accessible stories — not tables of numbers, but insights that make sense to any fan.

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

Data is fetched via a phased seed pipeline that respects FK constraints and API rate limits (10 req/min):

```
01-static       Confederations + countries          no API
02-teams        60 national teams                   1 req/team
03-competitions 12 competitions × 4 seasons         ~48 req
04-fixtures     Matches + stats + events            variable
05-players      Squad rosters per team              1 req/team
06-standings    League tables + team season stats   variable
```

If the daily request limit is hit, the process saves progress and exits cleanly. Re-running any phase resumes from where it left off.

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
| `GET /matches` | Recent matches (filterable by team) |
| `GET /matches/:id` | Match detail |

---

### Frontend — Next.js 14

Dark-theme interface built for readability. The design principle: one number, one story. Not a data dump — each stat is shown with the context that makes it meaningful.

Pages: homepage, matches, live, blog, search (team vs team + year).

---

### Blog — Payload CMS

A headless CMS running alongside the frontend. Articles are written in a rich-text editor and published via a REST API consumed by Next.js. Each article can be tagged with related teams and linked to real data from the database.

---

### ML — FastAPI

Python service that reads from the same PostgreSQL database. Planned models:

- Match outcome prediction based on recent form
- Offensive and defensive tendency profiling
- Custom performance ranking (independent of FIFA ranking)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | NestJS 10, TypeScript, Prisma ORM |
| CMS | Payload CMS v3 |
| ML | FastAPI, Python 3.11 |
| Database | PostgreSQL 16 |
| Monorepo | Turborepo + npm workspaces |
| Data source | API-Football v3 |
