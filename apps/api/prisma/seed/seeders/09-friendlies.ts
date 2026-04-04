// =============================================================================
// Seeder 09: Friendlies + uncaptured matches — fetched by team, not by league.
//
// Why this seeder exists:
//   seeder 04 iterates over configured league IDs. Any match in a competition
//   NOT in config.ts (friendlies, Nations League B/C, regional cups, etc.)
//   is never seeded. This seeder fills that gap.
//
// Strategy:
//   For each of our 60 teams, call GET /fixtures?team={id}&season={year}.
//   Only keep matches where BOTH teams are in our 60.
//   For unknown league IDs, auto-create Competition + CompetitionSeason.
//   Only seeds the base Match record (score, status, dates).
//   Events/lineups/player-stats can be enriched afterwards with seed:fixtures,
//   which will find the new CompetitionSeason records and fill in the detail.
//
// Deduplication:
//   Each match involves two teams, so the same fixture appears twice during
//   the outer loop (once per team). A processedInRun Set<number> of fixture
//   apiFootballIds prevents double work within a single execution.
//   DB-level upsert on (apiFootballId unique) handles cross-run safety.
//
// Fetch cost: 60 teams × 2 seasons = 120 API requests (~3 min on Starter plan)
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Ensure a Competition row exists for leagueId. Returns its db id. */
async function ensureCompetition(
  prisma: PrismaClient,
  leagueId: number,
  leagueName: string,
  competitionMap: Map<number, number>,
): Promise<number> {
  if (competitionMap.has(leagueId)) return competitionMap.get(leagueId)!;

  // Truncate to VarChar lengths
  const rawName  = (leagueName || `League ${leagueId}`).trim();
  const baseName = rawName.slice(0, 193); // leave room for " [id]" suffix

  // Detect name collision: another competition already uses this name
  const nameConflict = await prisma.competition.findFirst({
    where: { name: baseName, NOT: { apiFootballId: leagueId } },
    select: { id: true },
  });
  const finalName = nameConflict
    ? `${baseName} [${leagueId}]`.slice(0, 200)
    : baseName;

  const comp = await prisma.competition.upsert({
    where:  { apiFootballId: leagueId },
    update: {},          // never overwrite manually curated names
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

export async function seedFriendlies(prisma: PrismaClient) {
  console.log('\nSeeding friendlies & uncaptured matches (by team)...');

  const now     = new Date();
  const seasons = [now.getFullYear() - 1, now.getFullYear()];

  // ── Pre-load lookup maps from DB ──────────────────────────────────────────

  const teamMap = new Map<number, number>(); // apiFootballId → db id
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  // competitionMap: league apiFootballId → db Competition.id
  const competitionMap = new Map<number, number>();
  (await prisma.competition.findMany()).forEach(c => competitionMap.set(c.apiFootballId, c.id));

  // seasonMap: `{leagueApiId}-{year}` → db CompetitionSeason.id
  const seasonMap = new Map<string, number>();
  (await prisma.competitionSeason.findMany({ include: { competition: true } }))
    .forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const venueMap = new Map<number, number>(); // apiFootballId → db Venue.id
  (await prisma.venue.findMany({ where: { apiFootballId: { not: null } } }))
    .forEach(v => venueMap.set(v.apiFootballId!, v.id));

  // Pre-load all existing fixture apiFootballIds so we can log [SKIP] for them
  const existingFixtureIds = new Set<number>(
    (await prisma.match.findMany({ select: { apiFootballId: true } }))
      .map(m => m.apiFootballId),
  );

  // Dedup within this run — same fixture appears once per team (home + away)
  const processedInRun = new Set<number>();

  let newCount  = 0;
  let skipCount = 0;

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

      // Only finished matches where BOTH teams are in our 60
      const relevant = fixtures.filter(f =>
        ['FT', 'AET', 'PEN'].includes(f.fixture.status.short) &&
        teamMap.has(f.teams.home.id) &&
        teamMap.has(f.teams.away.id),
      );

      const skippable = relevant.filter(f =>
        processedInRun.has(f.fixture.id) || existingFixtureIds.has(f.fixture.id),
      );
      const toProcess = relevant.filter(f =>
        !processedInRun.has(f.fixture.id) && !existingFixtureIds.has(f.fixture.id),
      );

      if (skippable.length) {
        console.log(`    [SKIP] ${skippable.length} already in DB / processed this run`);
        skipCount += skippable.length;
        skippable.forEach(f => processedInRun.add(f.fixture.id));
      }
      if (!toProcess.length) continue;

      console.log(`    ${toProcess.length} new matches to seed`);

      for (const f of toProcess) {
        // Mark immediately so the other team's loop won't re-process
        processedInRun.add(f.fixture.id);

        const homeDbId = teamMap.get(f.teams.home.id)!;
        const awayDbId = teamMap.get(f.teams.away.id)!;

        try {
          // Ensure competition + season exist (auto-creates if unknown)
          const compDbId   = await ensureCompetition(prisma, f.league.id, f.league.name, competitionMap);
          const seasonDbId = await ensureSeason(prisma, compDbId, f.league.id, f.league.season, seasonMap);

          const venueId = f.fixture.venue.id
            ? (venueMap.get(f.fixture.venue.id) ?? null)
            : null;

          await prisma.match.upsert({
            where:  { apiFootballId: f.fixture.id },
            update: {
              statusShort:   f.fixture.status.short,
              statusLong:    f.fixture.status.long,
              statusElapsed: f.fixture.status.elapsed,
              homeScore:     f.score.fulltime.home,
              awayScore:     f.score.fulltime.away,
              homeScoreHt:   f.score.halftime.home,
              awayScoreHt:   f.score.halftime.away,
              homeScoreEt:   f.score.extratime.home,
              awayScoreEt:   f.score.extratime.away,
              homePenScore:  f.score.penalty.home,
              awayPenScore:  f.score.penalty.away,
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
              homeScore:           f.score.fulltime.home,
              awayScore:           f.score.fulltime.away,
              homeScoreHt:         f.score.halftime.home,
              awayScoreHt:         f.score.halftime.away,
              homeScoreEt:         f.score.extratime.home,
              awayScoreEt:         f.score.extratime.away,
              homePenScore:        f.score.penalty.home,
              awayPenScore:        f.score.penalty.away,
            },
            select: { id: true },
          });

          existingFixtureIds.add(f.fixture.id); // prevent duplicate insert in same run
          newCount++;
          console.log(
            `    [OK] ${f.teams.home.name} ${f.score.fulltime.home ?? '?'}-${f.score.fulltime.away ?? '?'} ${f.teams.away.name}  (${f.league.name})`,
          );
        } catch (err: any) {
          if (err instanceof DailyLimitError) throw err;
          console.warn(`    [WARN] fixture ${f.fixture.id} failed: ${err?.message ?? err}`);
        }
      }
    }
  }

  console.log(`\n  Friendlies seed complete.`);
  console.log(`  ${newCount} new matches inserted, ${skipCount} skipped (already in DB).`);
  console.log(`  Tip: run seed:fixtures to enrich with events / lineups / player stats.`);
}
