// =============================================================================
// Seeder 02: Matches
//   1. Fixtures by competition/season    (GET /fixtures?league={id}&season={year})
//   2. By-team scan for all other matches (GET /fixtures?team={id}&season={year})
//        — covers friendlies, Nations League B/C, regional cups, etc.
//   3. Upcoming calendar (NS/TBD fixtures) — refreshes kickoff times
//   4. Enrich all pending FT/AET/PEN matches
//
// All steps are idempotent. Deduplication via processedInRun Set per step.
// API cost: ~13 requests per competition-season + 120 requests for by-team scan
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, DailyLimitError } from '../api';
import { SEASONS, TEAMS } from '../config';
import { ApiFixture, matchUpdateData, matchCreateData, ensureCompetition, ensureSeason } from '../helpers/utils';
import { enrichMatch } from '../helpers/enrich-match';

const FINAL_STATUSES    = new Set(['FT', 'AET', 'PEN']);
const UPCOMING_STATUSES = new Set(['NS', 'TBD', 'PST', 'CANC', 'AWD', 'WO']);

// ─── Shared lookup loader ─────────────────────────────────────────────────────

async function loadMaps(prisma: PrismaClient) {
  const teamMap = new Map<number, number>();
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  const competitionMap = new Map<number, number>();
  (await prisma.competition.findMany()).forEach(c => competitionMap.set(c.apiFootballId, c.id));

  const seasonMap = new Map<string, number>();
  (await prisma.competitionSeason.findMany({ include: { competition: true } }))
    .forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const venueMap = new Map<number, number>();
  (await prisma.venue.findMany({ where: { apiFootballId: { not: null } } }))
    .forEach(v => venueMap.set(v.apiFootballId!, v.id));

  return { teamMap, competitionMap, seasonMap, venueMap };
}

// ─── Step 1: Fixtures by competition/season ───────────────────────────────────

async function seedByCompetition(
  prisma: PrismaClient,
  teamMap: Map<number, number>,
  seasonMap: Map<string, number>,
  venueMap: Map<number, number>,
) {
  console.log('\n[1/4] Fixtures by competition/season...');

  const competitionSeasons = await prisma.competitionSeason.findMany({
    include: { competition: true },
    where:   { apiFootballSeason: { in: SEASONS } },
  });

  for (const cs of competitionSeasons) {
    const leagueId = cs.competition.apiFootballId;
    const season   = cs.apiFootballSeason!;
    const seasonId = seasonMap.get(`${leagueId}-${season}`);
    if (!seasonId) continue;

    console.log(`\n  ${cs.competition.shortName} ${season}`);

    const fixtures = await apiGet<ApiFixture>('fixtures', { league: leagueId, season });

    const finished = fixtures.filter(f =>
      FINAL_STATUSES.has(f.fixture.status.short) &&
      teamMap.has(f.teams.home.id) &&
      teamMap.has(f.teams.away.id),
    );

    console.log(`  ${finished.length} finished matches`);

    for (const f of finished) {
      const homeDbId = teamMap.get(f.teams.home.id)!;
      const awayDbId = teamMap.get(f.teams.away.id)!;
      const venueId  = f.fixture.venue.id ? (venueMap.get(f.fixture.venue.id) ?? null) : null;

      const match = await prisma.match.upsert({
        where:  { apiFootballId: f.fixture.id },
        update: matchUpdateData(f),
        create: matchCreateData(f, seasonId, homeDbId, awayDbId, venueId),
      });

      const matchTeamMap = new Map([
        [f.teams.home.id, homeDbId],
        [f.teams.away.id, awayDbId],
      ]);

      try {
        const enriched = await enrichMatch(prisma, match.id, f.fixture.id, matchTeamMap);
        const tag = enriched ? 'enriched' : 'already done';
        console.log(`    [OK] ${f.teams.home.name} ${f.score.fulltime.home}-${f.score.fulltime.away} ${f.teams.away.name}  (${tag})`);
      } catch (err: any) {
        if (err instanceof DailyLimitError) throw err;
        console.warn(`    [WARN] fixture ${f.fixture.id} enrich failed: ${err?.message ?? err}`);
      }
    }
  }
}

// ─── Step 2+3: By-team scan (finished + upcoming) ────────────────────────────

async function seedByTeam(
  prisma: PrismaClient,
  teamMap: Map<number, number>,
  competitionMap: Map<number, number>,
  seasonMap: Map<string, number>,
  venueMap: Map<number, number>,
) {
  console.log('\n[2+3/4] By-team scan (friendlies, uncaptured, upcoming)...');

  const now     = new Date();
  // past: current year + previous year for finished matches
  // future: current + next year for upcoming calendar
  const pastSeasons    = [now.getFullYear() - 1, now.getFullYear()];
  const futureSeasons  = [now.getFullYear(), now.getFullYear() + 1];
  const allSeasons     = [...new Set([...pastSeasons, ...futureSeasons])];

  const existingFixtureIds = new Set<number>(
    (await prisma.match.findMany({ select: { apiFootballId: true } })).map(m => m.apiFootballId),
  );

  // dedup within this run — each fixture appears once per team (home + away)
  const processedInRun = new Set<number>();

  let newFinished  = 0;
  let newUpcoming  = 0;
  let updated      = 0;
  let skipped      = 0;

  for (const teamCfg of TEAMS) {
    if (teamCfg.apiFootballId === 0) continue;
    if (!teamMap.has(teamCfg.apiFootballId)) continue;

    for (const season of allSeasons) {
      let fixtures: ApiFixture[];
      try {
        fixtures = await apiGet<ApiFixture>('fixtures', { team: teamCfg.apiFootballId, season });
      } catch (err: any) {
        if (err instanceof DailyLimitError) throw err;
        console.warn(`  [WARN] ${teamCfg.fifaCode} ${season}: ${err?.message ?? err}`);
        continue;
      }

      // Only matches where BOTH teams are in our 60
      const relevant = fixtures.filter(f =>
        teamMap.has(f.teams.home.id) && teamMap.has(f.teams.away.id),
      );

      for (const f of relevant) {
        if (processedInRun.has(f.fixture.id)) { skipped++; continue; }
        processedInRun.add(f.fixture.id);

        const homeDbId = teamMap.get(f.teams.home.id)!;
        const awayDbId = teamMap.get(f.teams.away.id)!;
        const status   = f.fixture.status.short;

        try {
          const compDbId   = await ensureCompetition(prisma, f.league.id, f.league.name, competitionMap);
          const seasonDbId = await ensureSeason(prisma, compDbId, f.league.id, f.league.season, seasonMap);
          const venueId    = f.fixture.venue.id ? (venueMap.get(f.fixture.venue.id) ?? null) : null;

          if (FINAL_STATUSES.has(status)) {
            // Finished — upsert base record then enrich
            if (existingFixtureIds.has(f.fixture.id)) { skipped++; continue; }

            const match = await prisma.match.upsert({
              where:  { apiFootballId: f.fixture.id },
              update: matchUpdateData(f),
              create: matchCreateData(f, seasonDbId, homeDbId, awayDbId, venueId),
            });

            existingFixtureIds.add(f.fixture.id);
            newFinished++;

            const matchTeamMap = new Map([
              [f.teams.home.id, homeDbId],
              [f.teams.away.id, awayDbId],
            ]);
            await enrichMatch(prisma, match.id, f.fixture.id, matchTeamMap);

          } else if (UPCOMING_STATUSES.has(status)) {
            // Upcoming — upsert (update kickoff/status, never overwrite enrichStatus)
            const existing = await prisma.match.findUnique({
              where:  { apiFootballId: f.fixture.id },
              select: { id: true },
            });

            await prisma.match.upsert({
              where:  { apiFootballId: f.fixture.id },
              update: {
                kickoffAt:     new Date(f.fixture.date),
                timestamp:     f.fixture.timestamp,
                statusShort:   f.fixture.status.short,
                statusLong:    f.fixture.status.long,
                statusElapsed: f.fixture.status.elapsed,
                statusExtra:   f.fixture.status.extra,
                roundLabel:    f.league.round,
              },
              create: matchCreateData(f, seasonDbId, homeDbId, awayDbId, venueId),
            });

            existingFixtureIds.add(f.fixture.id);
            if (existing) { updated++; } else { newUpcoming++; }
          }
        } catch (err: any) {
          if (err instanceof DailyLimitError) throw err;
          console.warn(`  [WARN] fixture ${f.fixture.id}: ${err?.message ?? err}`);
        }
      }
    }

    console.log(`  [OK] ${teamCfg.fifaCode}`);
  }

  console.log(`\n  By-team scan complete:`);
  console.log(`  ${newFinished} new finished, ${newUpcoming} new upcoming, ${updated} updated, ${skipped} skipped`);
}

// ─── Step 4: Enrich pending finished matches ──────────────────────────────────

async function enrichPending(prisma: PrismaClient, teamMap: Map<number, number>) {
  console.log('\n[4/4] Enriching pending finished matches...');

  const pending = await prisma.match.findMany({
    where: {
      statusShort:  { in: ['FT', 'AET', 'PEN'] },
      enrichStatus: { not: 'FULLY_ENRICHED' },
    },
    select: {
      id:            true,
      apiFootballId: true,
      homeTeam:      { select: { id: true, apiFootballId: true, name: true } },
      awayTeam:      { select: { id: true, apiFootballId: true, name: true } },
      kickoffAt:     true,
      enrichStatus:  true,
    },
    orderBy: { kickoffAt: 'asc' },
  });

  if (!pending.length) {
    console.log('  All finished matches already FULLY_ENRICHED.');
    return;
  }

  console.log(`  ${pending.length} match(es) pending enrichment`);

  let enriched = 0;
  let failed   = 0;

  for (const match of pending) {
    const matchTeamMap = new Map([
      [match.homeTeam.apiFootballId, match.homeTeam.id],
      [match.awayTeam.apiFootballId, match.awayTeam.id],
    ]);

    const label = `${match.homeTeam.name} vs ${match.awayTeam.name} (${match.kickoffAt?.toISOString().slice(0, 10)})`;
    try {
      const didEnrich = await enrichMatch(prisma, match.id, match.apiFootballId, matchTeamMap);
      if (didEnrich) {
        enriched++;
        console.log(`  [OK] ${label}`);
      }
    } catch (err: any) {
      if (err instanceof DailyLimitError) {
        console.error(`\n  [STOP] Daily API limit reached. ${enriched} enriched, ${failed} failed. Re-run tomorrow.`);
        throw err;
      }
      failed++;
      console.warn(`  [FAIL] ${label}: ${err?.message ?? err}`);
    }
  }

  console.log(`  Enriched: ${enriched}  |  Failed: ${failed}`);
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function seedMatches(prisma: PrismaClient) {
  const { teamMap, competitionMap, seasonMap, venueMap } = await loadMaps(prisma);

  await seedByCompetition(prisma, teamMap, seasonMap, venueMap);
  await seedByTeam(prisma, teamMap, competitionMap, seasonMap, venueMap);
  await enrichPending(prisma, teamMap);
}
