// =============================================================================
// Seeder 04: Matches — seeds finished fixtures by competition/season,
//            then immediately enriches each one inline.
//
// Source:  GET /fixtures?league={id}&season={year}
// Enrich:  /fixtures/players + /fixtures/events + /fixtures/lineups
//          + /fixtures/statistics  (via shared enrich-match helper)
//
// Only processes matches where BOTH teams are in our 60.
// Enrichment is integrated — no separate seed:matches-finished needed
// for matches created here. enrichStatus is set to FULLY_ENRICHED on success.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, DailyLimitError } from '../api';
import { SEASONS } from '../config';
import { enrichMatch } from '../helpers/enrich-match';

interface ApiFixture {
  fixture: {
    id:        number;
    referee:   string | null;
    timezone:  string;
    date:      string;
    timestamp: number;
    periods:   { first: number | null; second: number | null };
    venue:     { id: number | null; name: string; city: string };
    status:    { long: string; short: string; elapsed: number | null; extra: number | null };
  };
  league: {
    id:     number;
    season: number;
    round:  string;
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

const FINAL_STATUSES = ['FT', 'AET', 'PEN'];

export async function seedFixtures(prisma: PrismaClient) {
  console.log('\nSeeding fixtures...');

  // Build lookup maps
  const teamMap = new Map<number, number>(); // apiFootballId → db id
  const teams = await prisma.nationalTeam.findMany();
  teams.forEach(t => teamMap.set(t.apiFootballId, t.id));

  const seasonMap = new Map<string, number>(); // `${compApiId}-${year}` → db season id
  const seasons = await prisma.competitionSeason.findMany({ include: { competition: true } });
  seasons.forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const venueMap = new Map<number, number>(); // apiFootballId → db id
  const venues = await prisma.venue.findMany({ where: { apiFootballId: { not: null } } });
  venues.forEach(v => venueMap.set(v.apiFootballId!, v.id));

  const competitionSeasons = await prisma.competitionSeason.findMany({
    include: { competition: true },
    where:   { apiFootballSeason: { in: SEASONS } },
  });

  for (const cs of competitionSeasons) {
    const leagueId = cs.competition.apiFootballId;
    const season   = cs.apiFootballSeason!;

    console.log(`\n  ${cs.competition.shortName} ${season}`);

    const fixtures = await apiGet<ApiFixture>('fixtures', { league: leagueId, season });

    // Only process finished matches involving our target teams
    const finished = fixtures.filter(f =>
      FINAL_STATUSES.includes(f.fixture.status.short) &&
      (teamMap.has(f.teams.home.id) || teamMap.has(f.teams.away.id)),
    );

    console.log(`    ${finished.length} finished matches`);

    for (const f of finished) {
      const homeDbId = teamMap.get(f.teams.home.id);
      const awayDbId = teamMap.get(f.teams.away.id);

      if (!homeDbId || !awayDbId) continue; // skip if either team not in our 60

      const seasonId = seasonMap.get(`${leagueId}-${season}`);
      if (!seasonId) continue;

      const venueId = f.fixture.venue.id ? venueMap.get(f.fixture.venue.id) ?? null : null;

      // Upsert the base match record
      const match = await prisma.match.upsert({
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
          competitionSeasonId: seasonId,
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
          enrichStatus:        'SCHEDULED',
        },
      });

      // Enrich immediately — sets FULLY_ENRICHED on success
      const matchTeamMap = new Map([
        [f.teams.home.id, homeDbId],
        [f.teams.away.id, awayDbId],
      ]);

      try {
        const enriched = await enrichMatch(prisma, match.id, f.fixture.id, matchTeamMap);
        const status = enriched ? 'enriched' : 'already done';
        console.log(`    [OK] ${f.teams.home.name} ${f.score.fulltime.home}-${f.score.fulltime.away} ${f.teams.away.name}  (${status})`);
      } catch (err: any) {
        if (err instanceof DailyLimitError) throw err;
        console.warn(`    [WARN] fixture ${f.fixture.id} enrich failed: ${err?.message ?? err}`);
      }
    }
  }
}
