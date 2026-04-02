// =============================================================================
// Seeder 04: Matches + Match Team Statistics + Match Events
//            + Match Lineups + Lineup Players + Player Match Stats
// Source: GET /fixtures?league={id}&season={year}
//         GET /fixtures/statistics?fixture={id}
//         GET /fixtures/events?fixture={id}
//         GET /fixtures/lineups?fixture={id}
//         GET /fixtures/players?fixture={id}
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

interface ApiLineupPlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
  grid: string | null;
}

interface ApiLineupResponse {
  team: { id: number };
  coach: { id: number | null; name: string | null };
  formation: string | null;
  startXI: { player: ApiLineupPlayer }[];
  substitutes: { player: ApiLineupPlayer }[];
}

interface ApiPlayerStatPlayer {
  id: number;
  name: string;
}

interface ApiPlayerStatTeam {
  id: number;
}

interface ApiPlayerStatEntry {
  player: ApiPlayerStatPlayer;
  statistics: {
    games: {
      minutes: number | null;
      rating: string | null;
      captain: boolean;
      substitute: boolean;
    };
    offsides: number | null;
    shots:    { total: number | null; on: number | null };
    goals:    { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
    passes:   { total: number | null; key: number | null; accuracy: string | null };
    tackles:  { total: number | null; blocks: number | null; interceptions: number | null };
    duels:    { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null; past: number | null };
    fouls:    { drawn: number | null; committed: number | null };
    cards:    { yellow: number; red: number };
    penalty:  { won: number | null; commited: number | null; scored: number | null; missed: number | null; saved: number | null };
  }[];
}

interface ApiPlayerStatsResponse {
  team: ApiPlayerStatTeam;
  players: ApiPlayerStatEntry[];
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

      try {
        await seedMatchStats(prisma, match.id, f.fixture.id, homeDbId, awayDbId);
        await seedMatchEvents(prisma, match.id, f.fixture.id, teamMap);
        await seedMatchLineups(prisma, match.id, f.fixture.id, teamMap);
        await seedMatchPlayerStats(prisma, match.id, f.fixture.id, teamMap);
      } catch (err: any) {
        // Re-throw rate limit errors so the orchestrator can stop gracefully
        if (err?.name === 'DailyLimitError') throw err;
        // Log and skip this fixture — it can be retried next run
        console.warn(`    [WARN] fixture ${f.fixture.id} failed: ${err?.message ?? err}`);
        continue;
      }

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
  // Skip if stats already exist for this match
  const existingStats = await prisma.matchTeamStatistics.count({ where: { matchId } });
  if (existingStats > 0) return;

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
  // Skip if events already exist for this match
  const existingEvents = await prisma.matchEvent.count({ where: { matchId } });
  if (existingEvents > 0) return;

  const events = await apiGet<ApiEvent>('fixtures/events', { fixture: fixtureApiId });

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

async function seedMatchLineups(
  prisma: PrismaClient,
  matchId: number,
  fixtureApiId: number,
  teamMap: Map<number, number>,
) {
  // Skip if lineups already exist for this match
  const existingLineups = await prisma.matchLineup.count({ where: { matchId } });
  if (existingLineups > 0) return;

  const lineups = await apiGet<ApiLineupResponse>('fixtures/lineups', { fixture: fixtureApiId });

  for (const lineup of lineups) {
    const teamDbId = teamMap.get(lineup.team.id);
    if (!teamDbId) continue;

    // Resolve coach if present
    let coachDbId: number | null = null;
    if (lineup.coach.id) {
      const coach = await prisma.coach.findUnique({ where: { apiFootballId: lineup.coach.id } });
      coachDbId = coach?.id ?? null;
    }

    const matchLineup = await prisma.matchLineup.upsert({
      where: { matchId_teamId: { matchId, teamId: teamDbId } },
      update: { formation: lineup.formation, coachId: coachDbId },
      create: {
        matchId,
        teamId:    teamDbId,
        coachId:   coachDbId,
        formation: lineup.formation,
      },
    });

    const allPlayers = [
      ...(lineup.startXI    ?? []).map(e => ({ ...e.player, isStarter: true })),
      ...(lineup.substitutes ?? []).map(e => ({ ...e.player, isStarter: false })),
    ];

    for (const lp of allPlayers) {
      if (!lp.id) continue; // API sometimes returns null player id
      const player = await prisma.player.findUnique({ where: { apiFootballId: lp.id } });
      if (!player) continue;

      await prisma.lineupPlayer.upsert({
        where: { lineupId_playerId: { lineupId: matchLineup.id, playerId: player.id } },
        update: {},
        create: {
          lineupId:     matchLineup.id,
          playerId:     player.id,
          shirtNumber:  lp.number,
          positionCode: lp.pos || null,
          gridPosition: lp.grid,
          isStarter:    lp.isStarter,
        },
      });
    }
  }
}

async function seedMatchPlayerStats(
  prisma: PrismaClient,
  matchId: number,
  fixtureApiId: number,
  teamMap: Map<number, number>,
) {
  // Skip if player stats already exist for this match
  const existingStats = await prisma.playerMatchStats.count({ where: { matchId } });
  if (existingStats > 0) return;

  const teamStats = await apiGet<ApiPlayerStatsResponse>('fixtures/players', { fixture: fixtureApiId });

  for (const ts of teamStats) {
    const teamDbId = teamMap.get(ts.team.id);
    if (!teamDbId) continue;

    for (const entry of ts.players) {
      const player = await prisma.player.findUnique({ where: { apiFootballId: entry.player.id } });
      if (!player) continue;

      const s = entry.statistics[0];
      if (!s) continue;

      const rating = s.games.rating ? parseFloat(s.games.rating) : null;
      const passAccuracy = s.passes.accuracy
        ? parseFloat(String(s.passes.accuracy).replace('%', ''))
        : null;

      await prisma.playerMatchStats.upsert({
        where: { matchId_playerId: { matchId, playerId: player.id } },
        update: {},
        create: {
          matchId,
          playerId:          player.id,
          teamId:            teamDbId,
          minutesPlayed:     s.games.minutes,
          rating:            isNaN(rating!) ? null : rating,
          captain:           s.games.captain ?? false,
          substitute:        s.games.substitute ?? false,
          goals:             s.goals.total ?? 0,
          goalsConceded:     s.goals.conceded,
          assists:           s.goals.assists ?? 0,
          saves:             s.goals.saves,
          shots:             s.shots.total,
          shotsOnTarget:     s.shots.on,
          passes:            s.passes.total,
          keyPasses:         s.passes.key,
          passAccuracyPct:   isNaN(passAccuracy!) ? null : passAccuracy,
          tackles:           s.tackles.total,
          blockedShots:      s.tackles.blocks,
          interceptions:     s.tackles.interceptions,
          duelsTotal:        s.duels.total,
          duelsWon:          s.duels.won,
          dribbles:          s.dribbles.attempts,
          dribblesCompleted: s.dribbles.success,
          dribblesPast:      s.dribbles.past,
          foulsCommitted:    s.fouls.committed,
          foulsSuffered:     s.fouls.drawn,
          yellowCards:       s.cards.yellow ?? 0,
          redCards:          s.cards.red ?? 0,
          offsides:          s.offsides,
          penaltyWon:        s.penalty.won,
          penaltyCommitted:  s.penalty.commited,
          penaltyScored:     s.penalty.scored,
          penaltyMissed:     s.penalty.missed,
          penaltySaved:      s.penalty.saved,
        },
      });
    }
  }
}
