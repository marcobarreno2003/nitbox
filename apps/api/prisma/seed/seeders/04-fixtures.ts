// =============================================================================
// Seeder 04: Matches + Match Team Statistics + Match Events
// Source: GET /fixtures?league={id}&season={year}
//         GET /fixtures/statistics?fixture={id}
//         GET /fixtures/events?fixture={id}
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';
import { SEASONS } from '../config';

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

interface ApiStatEntry { type: string; value: string | number | null }
interface ApiStatResponse { team: { id: number }; statistics: ApiStatEntry[] }

interface ApiEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { id: number | null; name: string | null };
  assist:  { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments: string | null;
}

function parseStat(stats: ApiStatEntry[], type: string): number | null {
  const entry = stats.find(s => s.type === type);
  if (!entry || entry.value === null) return null;
  const raw = String(entry.value).replace('%', '').trim();
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

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
    where: { apiFootballSeason: { in: SEASONS } },
  });

  for (const cs of competitionSeasons) {
    const leagueId = cs.competition.apiFootballId;
    const season   = cs.apiFootballSeason!;

    console.log(`\n  ${cs.competition.shortName} ${season}`);

    const fixtures = await apiGet<ApiFixture>('fixtures', { league: leagueId, season });

    // Only process finished matches involving our target teams
    const finished = fixtures.filter(f =>
      ['FT', 'AET', 'PEN'].includes(f.fixture.status.short) &&
      (teamMap.has(f.teams.home.id) || teamMap.has(f.teams.away.id))
    );

    console.log(`    ${finished.length} finished matches`);

    for (const f of finished) {
      const homeDbId = teamMap.get(f.teams.home.id);
      const awayDbId = teamMap.get(f.teams.away.id);

      if (!homeDbId || !awayDbId) continue; // skip if either team not in our 60

      const seasonId = seasonMap.get(`${leagueId}-${season}`);
      if (!seasonId) continue;

      const venueId = f.fixture.venue.id ? venueMap.get(f.fixture.venue.id) ?? null : null;

      // Upsert match
      const match = await prisma.match.upsert({
        where: { apiFootballId: f.fixture.id },
        update: {
          statusShort:        f.fixture.status.short,
          statusLong:         f.fixture.status.long,
          statusElapsed:      f.fixture.status.elapsed,
          homeScore:          f.score.fulltime.home,
          awayScore:          f.score.fulltime.away,
          homeScoreHt:        f.score.halftime.home,
          awayScoreHt:        f.score.halftime.away,
          homeScoreEt:        f.score.extratime.home,
          awayScoreEt:        f.score.extratime.away,
          homePenScore:       f.score.penalty.home,
          awayPenScore:       f.score.penalty.away,
        },
        create: {
          apiFootballId:      f.fixture.id,
          competitionSeasonId: seasonId,
          homeTeamId:         homeDbId,
          awayTeamId:         awayDbId,
          venueId,
          kickoffAt:          new Date(f.fixture.date),
          timezone:           f.fixture.timezone,
          timestamp:          f.fixture.timestamp,
          periodFirstStart:   f.fixture.periods.first,
          periodSecondStart:  f.fixture.periods.second,
          statusShort:        f.fixture.status.short,
          statusLong:         f.fixture.status.long,
          statusElapsed:      f.fixture.status.elapsed,
          statusExtra:        f.fixture.status.extra,
          roundLabel:         f.league.round,
          refereeMain:        f.fixture.referee,
          homeScore:          f.score.fulltime.home,
          awayScore:          f.score.fulltime.away,
          homeScoreHt:        f.score.halftime.home,
          awayScoreHt:        f.score.halftime.away,
          homeScoreEt:        f.score.extratime.home,
          awayScoreEt:        f.score.extratime.away,
          homePenScore:       f.score.penalty.home,
          awayPenScore:       f.score.penalty.away,
        },
      });

      // Fetch & upsert match statistics (1 request per match — budget carefully)
      await seedMatchStats(prisma, match.id, f.fixture.id, homeDbId, awayDbId);

      // Fetch & upsert match events
      await seedMatchEvents(prisma, match.id, f.fixture.id, teamMap);

      console.log(`    [OK] ${f.teams.home.name} ${f.score.fulltime.home}-${f.score.fulltime.away} ${f.teams.away.name}`);
    }
  }
}

async function seedMatchStats(
  prisma: PrismaClient,
  matchId: number,
  fixtureApiId: number,
  homeDbId: number,
  awayDbId: number,
) {
  const results = await apiGet<ApiStatResponse>('fixtures/statistics', { fixture: fixtureApiId });

  for (const r of results) {
    const s = r.statistics;
    const isHome = r.team.id !== undefined;
    // Determine which db team this stat belongs to
    const apiTeamId = r.team.id;
    const teamDbId  = [homeDbId, awayDbId].find(() => true)!; // resolved below

    // Re-fetch to get proper team id mapping from match
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { homeTeamId: true, awayTeamId: true, homeTeam: { select: { apiFootballId: true } }, awayTeam: { select: { apiFootballId: true } } },
    });
    if (!match) continue;

    const resolvedTeamId = match.homeTeam.apiFootballId === apiTeamId
      ? match.homeTeamId
      : match.awayTeamId;

    await prisma.matchTeamStatistics.upsert({
      where: { matchId_teamId: { matchId, teamId: resolvedTeamId } },
      update: {},
      create: {
        matchId,
        teamId:            resolvedTeamId,
        isHome:            match.homeTeam.apiFootballId === apiTeamId,
        possessionPct:     parseStat(s, 'Ball Possession'),
        shots:             parseStat(s, 'Total Shots'),
        shotsOnTarget:     parseStat(s, 'Shots on Goal'),
        shotsOffTarget:    parseStat(s, 'Shots off Goal'),
        shotsBlocked:      parseStat(s, 'Blocked Shots'),
        shotsInsideBox:    parseStat(s, 'Shots insidebox'),
        shotsOutsideBox:   parseStat(s, 'Shots outsidebox'),
        xG:                parseStat(s, 'expected_goals'),
        goalsPrevented:    parseStat(s, 'goals_prevented'),
        passes:            parseStat(s, 'Total passes'),
        passesCompleted:   parseStat(s, 'Passes accurate'),
        passAccuracyPct:   parseStat(s, 'Passes %'),
        corners:           parseStat(s, 'Corner Kicks'),
        fouls:             parseStat(s, 'Fouls'),
        yellowCards:       parseStat(s, 'Yellow Cards'),
        redCards:          parseStat(s, 'Red Cards'),
        offsides:          parseStat(s, 'Offsides'),
        saves:             parseStat(s, 'Goalkeeper Saves'),
      },
    });
  }
}

async function seedMatchEvents(
  prisma: PrismaClient,
  matchId: number,
  fixtureApiId: number,
  teamMap: Map<number, number>,
) {
  const events = await apiGet<ApiEvent>('fixtures/events', { fixture: fixtureApiId });

  // Delete existing events for idempotency
  await prisma.matchEvent.deleteMany({ where: { matchId } });

  for (const e of events) {
    const teamDbId = teamMap.get(e.team.id);
    if (!teamDbId) continue;

    // Resolve player IDs if they exist in our DB
    let playerDbId: number | null = null;
    let assistDbId: number | null = null;

    if (e.player.id) {
      const p = await prisma.player.findUnique({ where: { apiFootballId: e.player.id } });
      playerDbId = p?.id ?? null;
    }
    if (e.assist.id) {
      const a = await prisma.player.findUnique({ where: { apiFootballId: e.assist.id } });
      assistDbId = a?.id ?? null;
    }

    await prisma.matchEvent.create({
      data: {
        matchId,
        teamId:        teamDbId,
        playerId:      playerDbId,
        assistPlayerId: assistDbId,
        minute:        e.time.elapsed,
        extraTime:     e.time.extra,
        type:          e.type,
        detail:        e.detail,
        comments:      e.comments,
      },
    });
  }
}
