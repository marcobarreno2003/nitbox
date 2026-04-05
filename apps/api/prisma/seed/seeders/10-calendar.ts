// =============================================================================
// Seeder 10: Upcoming Calendar — seeds future (NS) fixtures for all 60 teams.
//
// Purpose:
//   Populates the Match table with scheduled matches so LiveSyncService and
//   PreMatchService know what to watch. Runs daily via GitHub Actions so the
//   calendar is always at least 365 days ahead (through the World Cup 2026).
//
// Strategy:
//   For each of our 60 teams, fetch GET /fixtures?team={id}&season={year}.
//   Keep only NS (Not Started) fixtures where BOTH teams are in our 60.
//   Auto-creates Competition + CompetitionSeason rows for unknown leagues
//   (same pattern as seeder 09).
//   Sets enrichStatus = SCHEDULED on new rows (pipeline entry point).
//   Updates kickoffAt + status on existing rows (API may adjust kickoff times).
//
// Deduplication:
//   Same fixture appears once per participating team during the outer loop.
//   processedInRun Set<number> prevents double work per execution.
//   DB upsert on apiFootballId handles cross-run safety.
//
// Fetch cost: 60 teams × 2 seasons = 120 requests (~3 min on Starter plan)
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, DailyLimitError } from '../api';
import { TEAMS } from '../config';

interface ApiFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: { first: number | null; second: number | null };
    venue: { id: number | null; name: string; city: string };
    status: { long: string; short: string; elapsed: number | null; extra: number | null };
  };
  league: {
    id: number;
    name: string;
    season: number;
    round: string;
  };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime:  { home: number | null; away: number | null };
    fulltime:  { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty:   { home: number | null; away: number | null };
  };
}

// Statuses that mean the match has not kicked off yet
const UPCOMING_STATUSES = new Set(['NS', 'TBD', 'PST', 'CANC', 'AWD', 'WO']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Ensure a Competition row exists for leagueId. Returns its db id. */
async function ensureCompetition(
  prisma: PrismaClient,
  leagueId: number,
  leagueName: string,
  competitionMap: Map<number, number>,
): Promise<number> {
  if (competitionMap.has(leagueId)) return competitionMap.get(leagueId)!;

  const rawName  = (leagueName || `League ${leagueId}`).trim();
  const baseName = rawName.slice(0, 193);

  const nameConflict = await prisma.competition.findFirst({
    where: { name: baseName, NOT: { apiFootballId: leagueId } },
    select: { id: true },
  });
  const finalName = nameConflict
    ? `${baseName} [${leagueId}]`.slice(0, 200)
    : baseName;

  const comp = await prisma.competition.upsert({
    where:  { apiFootballId: leagueId },
    update: {},
    create: {
      apiFootballId: leagueId,
      name:          finalName,
      shortName:     finalName.slice(0, 50),
      type:          'friendly',
    },
  });

  competitionMap.set(leagueId, comp.id);
  console.log(`    [NEW COMPETITION] "${finalName}" (leagueId=${leagueId})`);
  return comp.id;
}

/** Ensure a CompetitionSeason row exists. Returns its db id. */
async function ensureSeason(
  prisma: PrismaClient,
  compDbId: number,
  leagueId: number,
  year: number,
  seasonMap: Map<string, number>,
): Promise<number> {
  const key = `${leagueId}-${year}`;
  if (seasonMap.has(key)) return seasonMap.get(key)!;

  const now = new Date();
  const cs  = await prisma.competitionSeason.upsert({
    where:  { competitionId_label: { competitionId: compDbId, label: String(year) } },
    update: {},
    create: {
      competitionId:     compDbId,
      apiFootballSeason: year,
      label:             String(year),
      startDate:         new Date(year, 0, 1),
      endDate:           new Date(year, 11, 31),
      isCurrent:         year === now.getFullYear(),
    },
  });

  seasonMap.set(key, cs.id);
  return cs.id;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function seedCalendar(prisma: PrismaClient) {
  console.log('\nSeeding upcoming calendar (NS fixtures by team)...');

  const now     = new Date();
  // Fetch current year + next year to cover World Cup 2026 and beyond
  const seasons = [now.getFullYear(), now.getFullYear() + 1];

  // ── Pre-load lookup maps from DB ──────────────────────────────────────────

  const teamMap = new Map<number, number>(); // apiFootballId → db id
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  const competitionMap = new Map<number, number>(); // leagueApiId → db Competition.id
  (await prisma.competition.findMany()).forEach(c => competitionMap.set(c.apiFootballId, c.id));

  const seasonMap = new Map<string, number>(); // `{leagueApiId}-{year}` → db CompetitionSeason.id
  (await prisma.competitionSeason.findMany({ include: { competition: true } }))
    .forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const venueMap = new Map<number, number>(); // apiFootballId → db Venue.id
  (await prisma.venue.findMany({ where: { apiFootballId: { not: null } } }))
    .forEach(v => venueMap.set(v.apiFootballId!, v.id));

  // Dedup within this run — same fixture can appear once per participating team
  const processedInRun = new Set<number>();

  let newCount    = 0;
  let updateCount = 0;
  let skipCount   = 0;

  // ── Loop each team × season ───────────────────────────────────────────────

  for (const teamCfg of TEAMS) {
    if (teamCfg.apiFootballId === 0) {
      console.log(`  [SKIP] ${teamCfg.fifaCode} — no apiFootballId`);
      continue;
    }
    if (!teamMap.has(teamCfg.apiFootballId)) {
      console.warn(`  [WARN] ${teamCfg.fifaCode} not found in DB — run seed:teams first`);
      continue;
    }

    for (const season of seasons) {
      console.log(`\n  ${teamCfg.fifaCode} ${season}`);

      let fixtures: ApiFixture[];
      try {
        fixtures = await apiGet<ApiFixture>('fixtures', {
          team:   teamCfg.apiFootballId,
          season,
        });
      } catch (err: any) {
        if (err instanceof DailyLimitError) throw err;
        console.warn(`    [WARN] API fetch failed: ${err?.message ?? err}`);
        continue;
      }

      // Only upcoming matches where BOTH teams are in our 60
      const relevant = fixtures.filter(f =>
        UPCOMING_STATUSES.has(f.fixture.status.short) &&
        teamMap.has(f.teams.home.id) &&
        teamMap.has(f.teams.away.id),
      );

      if (!relevant.length) {
        console.log(`    No upcoming matches`);
        continue;
      }

      // Split into already-processed (this run) vs new
      const toProcess = relevant.filter(f => !processedInRun.has(f.fixture.id));
      const alreadyDone = relevant.length - toProcess.length;
      if (alreadyDone > 0) {
        skipCount += alreadyDone;
        console.log(`    [SKIP] ${alreadyDone} already processed this run`);
      }

      if (!toProcess.length) continue;
      console.log(`    ${toProcess.length} upcoming match(es) to upsert`);

      for (const f of toProcess) {
        processedInRun.add(f.fixture.id);

        const homeDbId = teamMap.get(f.teams.home.id)!;
        const awayDbId = teamMap.get(f.teams.away.id)!;

        try {
          const compDbId   = await ensureCompetition(prisma, f.league.id, f.league.name, competitionMap);
          const seasonDbId = await ensureSeason(prisma, compDbId, f.league.id, f.league.season, seasonMap);

          const venueId = f.fixture.venue.id
            ? (venueMap.get(f.fixture.venue.id) ?? null)
            : null;

          // Check if the match already exists to decide new vs update
          const existing = await prisma.match.findUnique({
            where:  { apiFootballId: f.fixture.id },
            select: { id: true },
          });

          await prisma.match.upsert({
            where:  { apiFootballId: f.fixture.id },
            // On update: refresh kickoff time and status (API adjusts these)
            // Never overwrite enrichStatus — it may already be LINEUPS_CONFIRMED or LIVE
            update: {
              kickoffAt:     new Date(f.fixture.date),
              timestamp:     f.fixture.timestamp,
              statusShort:   f.fixture.status.short,
              statusLong:    f.fixture.status.long,
              statusElapsed: f.fixture.status.elapsed,
              statusExtra:   f.fixture.status.extra,
              roundLabel:    f.league.round,
            },
            create: {
              apiFootballId:       f.fixture.id,
              competitionSeasonId: seasonDbId,
              homeTeamId:          homeDbId,
              awayTeamId:          awayDbId,
              venueId,
              kickoffAt:           new Date(f.fixture.date),
              timezone:            f.fixture.timezone,
              timestamp:           f.fixture.timestamp,
              periodFirstStart:    f.fixture.periods.first,
              periodSecondStart:   f.fixture.periods.second,
              statusShort:         f.fixture.status.short,
              statusLong:          f.fixture.status.long,
              statusElapsed:       f.fixture.status.elapsed,
              statusExtra:         f.fixture.status.extra,
              roundLabel:          f.league.round,
              refereeMain:         f.fixture.referee,
              enrichStatus:        'SCHEDULED',
            },
          });

          if (existing) {
            updateCount++;
            console.log(`    [UPDATE] ${f.teams.home.name} vs ${f.teams.away.name}  (${f.fixture.date.slice(0, 10)})`);
          } else {
            newCount++;
            console.log(`    [NEW] ${f.teams.home.name} vs ${f.teams.away.name}  (${f.fixture.date.slice(0, 10)})  [${f.league.name}]`);
          }
        } catch (err: any) {
          if (err instanceof DailyLimitError) throw err;
          console.warn(`    [WARN] fixture ${f.fixture.id} failed: ${err?.message ?? err}`);
        }
      }
    }
  }

  console.log(`\n  Calendar seed complete.`);
  console.log(`  ${newCount} new matches inserted, ${updateCount} updated, ${skipCount} skipped (processed this run).`);
}
