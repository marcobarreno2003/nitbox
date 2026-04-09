// =============================================================================
// Shared match enrichment helpers.
//
// All functions are idempotent — safe to call multiple times.
// playerMap (apiFootballId → db id) is pre-loaded once in enrichMatch and
// passed down to avoid N+1 lookups across all enrichment steps.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, DailyLimitError } from '../api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiStatEntry { type: string; value: string | number | null }

interface ApiEvent {
  time:    { elapsed: number; extra: number | null };
  team:    { id: number };
  player:  { id: number | null; name: string | null };
  assist:  { id: number | null; name: string | null };
  type:    string;
  detail:  string;
  comments: string | null;
}

interface ApiLineupPlayer {
  id:     number | null;
  name:   string | null;
  number: number;
  pos:    string | null;
  grid:   string | null;
}

interface ApiLineupResponse {
  team:        { id: number };
  coach:       { id: number | null; name: string | null };
  formation:   string | null;
  startXI:     { player: ApiLineupPlayer }[];
  substitutes: { player: ApiLineupPlayer }[];
}

interface ApiPlayerStatEntry {
  player: { id: number; name: string };
  statistics: {
    games:    { minutes: number | null; rating: string | null; captain: boolean; substitute: boolean };
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
  team:    { id: number };
  players: ApiPlayerStatEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseStat(stats: ApiStatEntry[], type: string): number | null {
  const entry = stats.find(s => s.type === type);
  if (!entry || entry.value === null) return null;
  const raw = String(entry.value).replace('%', '').trim();
  const n   = parseFloat(raw);
  return isNaN(n) ? null : n;
}

// ── Player Stats ──────────────────────────────────────────────────────────────

export async function enrichPlayerStats(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
  playerMap: Map<number, number>,
): Promise<void> {
  // Skip API call if stats already exist for this match
  const existingCount = await prisma.playerMatchStats.count({ where: { matchId } });
  if (existingCount > 0) return;

  const teamStats = await apiGet<ApiPlayerStatsResponse>('fixtures/players', { fixture: fixtureId });

  for (const ts of teamStats) {
    const teamDbId = teamMap.get(ts.team.id);
    if (!teamDbId) continue;

    for (const entry of ts.players) {
      if (!entry.player?.id) continue;

      const playerDbId = playerMap.get(entry.player.id);
      if (!playerDbId) continue;

      const s = entry.statistics[0];
      if (!s) continue;

      const rating  = s.games.rating    ? parseFloat(s.games.rating) : null;
      const passAcc = s.passes.accuracy ? parseFloat(String(s.passes.accuracy).replace('%', '')) : null;

      // passesCompleted: derived from accuracy × total (API doesn't return it directly)
      const passesCompleted = (passAcc !== null && s.passes.total !== null)
        ? Math.round((passAcc / 100) * s.passes.total)
        : null;

      const playerStatFields = {
        minutesPlayed:     s.games.minutes,
        rating:            (rating !== null && !isNaN(rating)) ? rating : null,
        captain:           s.games.captain    ?? false,
        substitute:        s.games.substitute ?? false,
        goals:             s.goals.total      ?? 0,
        goalsConceded:     s.goals.conceded,
        assists:           s.goals.assists    ?? 0,
        saves:             s.goals.saves,
        shots:             s.shots.total,
        shotsOnTarget:     s.shots.on,
        passes:            s.passes.total,
        passesCompleted,
        keyPasses:         s.passes.key,
        passAccuracyPct:   (passAcc !== null && !isNaN(passAcc)) ? passAcc : null,
        tackles:           s.tackles.total,
        blockedShots:      s.tackles.blocks,
        interceptions:     s.tackles.interceptions,
        clearances:        null,  // not available per-player in API-Football v3
        duelsTotal:        s.duels.total,
        duelsWon:          s.duels.won,
        dribbles:          s.dribbles.attempts,
        dribblesCompleted: s.dribbles.success,
        dribblesPast:      s.dribbles.past,
        foulsCommitted:    s.fouls.committed,
        foulsSuffered:     s.fouls.drawn,
        yellowCards:       s.cards.yellow ?? 0,
        redCards:          s.cards.red    ?? 0,
        offsides:          s.offsides,
        penaltyWon:        s.penalty.won,
        penaltyCommitted:  s.penalty.commited,
        penaltyScored:     s.penalty.scored,
        penaltyMissed:     s.penalty.missed,
        penaltySaved:      s.penalty.saved,
      };

      await prisma.playerMatchStats.upsert({
        where:  { matchId_playerId: { matchId, playerId: playerDbId } },
        create: { matchId, playerId: playerDbId, teamId: teamDbId, ...playerStatFields },
        update: playerStatFields,
      });
    }
  }
}

// ── Match Events ──────────────────────────────────────────────────────────────

export async function enrichMatchEvents(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
  playerMap: Map<number, number>,
): Promise<void> {
  // Check DB first — events are immutable after FT, skip API call entirely if already populated
  const existing = await prisma.matchEvent.count({ where: { matchId } });
  if (existing > 0) return;

  const events = await apiGet<ApiEvent>('fixtures/events', { fixture: fixtureId });
  if (!events.length) return;

  for (const e of events) {
    const teamDbId = teamMap.get(e.team.id);
    if (!teamDbId) continue;

    const playerDbId = e.player.id ? (playerMap.get(e.player.id) ?? null) : null;
    const assistDbId  = e.assist.id  ? (playerMap.get(e.assist.id)  ?? null) : null;

    await prisma.matchEvent.create({
      data: {
        matchId,
        teamId:         teamDbId,
        playerId:       playerDbId,
        assistPlayerId: assistDbId,
        minute:         e.time.elapsed,
        extraTime:      e.time.extra,
        type:           e.type,
        detail:         e.detail,
        comments:       e.comments,
      } as any,
    });
  }
}

// ── Lineups ───────────────────────────────────────────────────────────────────

export async function enrichLineups(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
  playerMap: Map<number, number>,
): Promise<void> {
  const lineups = await apiGet<ApiLineupResponse>('fixtures/lineups', { fixture: fixtureId });

  for (const lineup of lineups) {
    const teamDbId = teamMap.get(lineup.team.id);
    if (!teamDbId) continue;

    let coachDbId: number | null = null;
    if (lineup.coach?.id) {
      const coach = await prisma.coach.findUnique({ where: { apiFootballId: lineup.coach.id } });
      coachDbId = coach?.id ?? null;
    }

    const matchLineup = await prisma.matchLineup.upsert({
      where:  { matchId_teamId: { matchId, teamId: teamDbId } },
      create: { matchId, teamId: teamDbId, coachId: coachDbId, formation: lineup.formation },
      update: { coachId: coachDbId, formation: lineup.formation },
    });

    const allPlayers = [
      ...(lineup.startXI    ?? []).map(e => ({ ...e.player, isStarter: true  })),
      ...(lineup.substitutes ?? []).map(e => ({ ...e.player, isStarter: false })),
    ];

    for (const lp of allPlayers) {
      if (!lp.id) continue;
      const playerDbId = playerMap.get(lp.id);
      if (!playerDbId) continue;

      await prisma.lineupPlayer.upsert({
        where:  { lineupId_playerId: { lineupId: matchLineup.id, playerId: playerDbId } },
        create: {
          lineupId:     matchLineup.id,
          playerId:     playerDbId,
          shirtNumber:  lp.number ?? null,
          positionCode: lp.pos    ?? null,
          gridPosition: lp.grid   ?? null,
          isStarter:    lp.isStarter,
        },
        update: {
          shirtNumber:  lp.number ?? null,
          positionCode: lp.pos    ?? null,
          gridPosition: lp.grid   ?? null,
          isStarter:    lp.isStarter,
        },
      });
    }
  }
}

// ── Team Statistics ───────────────────────────────────────────────────────────

export async function enrichTeamStats(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
): Promise<void> {
  const results = await apiGet<{ team: { id: number }; statistics: ApiStatEntry[] }>(
    'fixtures/statistics', { fixture: fixtureId },
  );

  for (const r of results) {
    const teamDbId = teamMap.get(r.team.id);
    if (!teamDbId) continue;

    const s = r.statistics;

    const teamStatFields = {
      possessionPct:   parseStat(s, 'Ball Possession'),
      shots:           parseStat(s, 'Total Shots'),
      shotsOnTarget:   parseStat(s, 'Shots on Goal'),
      shotsOffTarget:  parseStat(s, 'Shots off Goal'),
      shotsBlocked:    parseStat(s, 'Blocked Shots'),
      shotsInsideBox:  parseStat(s, 'Shots insidebox'),
      shotsOutsideBox: parseStat(s, 'Shots outsidebox'),
      xG:              parseStat(s, 'expected_goals'),
      xGOt:            parseStat(s, 'expected_goals_on_target'),
      goalsPrevented:  parseStat(s, 'goals_prevented'),
      passes:          parseStat(s, 'Total passes'),
      passesCompleted: parseStat(s, 'Passes accurate'),
      passAccuracyPct: parseStat(s, 'Passes %'),
      corners:         parseStat(s, 'Corner Kicks'),
      fouls:           parseStat(s, 'Fouls'),
      yellowCards:     parseStat(s, 'Yellow Cards'),
      redCards:        parseStat(s, 'Red Cards'),
      offsides:        parseStat(s, 'Offsides'),
      saves:           parseStat(s, 'Goalkeeper Saves'),
    };

    await prisma.matchTeamStatistics.upsert({
      where:  { matchId_teamId: { matchId, teamId: teamDbId } },
      create: { matchId, teamId: teamDbId, ...teamStatFields },
      update: teamStatFields,
    });
  }
}

// ── NitboxAward: Player of the Match ─────────────────────────────────────────

export async function calculatePlayerOfMatch(
  prisma:  PrismaClient,
  matchId: number,
): Promise<void> {
  const playerStats = await prisma.playerMatchStats.findMany({
    where:   { matchId },
    include: { player: { select: { position: true } } },
  });

  if (!playerStats.length) return;

  let topScore    = -1;
  let topPlayerId: number | null = null;

  for (const ps of playerStats) {
    if (!ps.minutesPlayed || ps.minutesPlayed < 20) continue;

    const isGK   = ps.player.position === 'GK';
    const rating = ps.rating ?? 6.0;

    let score: number;
    if (isGK) {
      score = (ps.saves ?? 0) * 15
            + rating * 7
            + ((ps.goalsConceded ?? 1) === 0 ? 20 : 0)
            + (ps.tackles ?? 0) * 2;
    } else {
      score = (ps.goals ?? 0)        * 20
            + (ps.assists ?? 0)      * 12
            + (ps.keyPasses ?? 0)    * 3
            + rating                 * 5
            + (ps.tackles ?? 0)      * 2
            + (ps.interceptions ?? 0) * 2;
    }

    score = score * (90 / Math.max(ps.minutesPlayed, 1));

    if (score > topScore) {
      topScore    = score;
      topPlayerId = ps.playerId;
    }
  }

  if (!topPlayerId) return;

  const match = await prisma.match.findUnique({
    where:  { id: matchId },
    select: { competitionSeason: { select: { apiFootballSeason: true } } },
  });

  await prisma.nitboxAward.upsert({
    where:  { type_matchId: { type: 'PLAYER_OF_MATCH', matchId } },
    create: {
      type:       'PLAYER_OF_MATCH',
      playerId:   topPlayerId,
      matchId,
      seasonYear: match?.competitionSeason?.apiFootballSeason ?? new Date().getFullYear(),
      score:      topScore,
    },
    update: { playerId: topPlayerId, score: topScore },
  });
}

// ── Full enrichment in one call ───────────────────────────────────────────────
// Loads playerMap once, then runs all steps sequentially (not parallel) to
// respect the API rate limit — concurrent calls would fire all at once.

export async function enrichMatch(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
): Promise<boolean> {
  const match = await prisma.match.findUnique({
    where:  { id: matchId },
    select: { enrichStatus: true },
  });

  if (match?.enrichStatus === 'FULLY_ENRICHED') return false;

  // Pre-load all players once — eliminates N+1 lookups across all steps
  const playerMap = new Map<number, number>();
  (await prisma.player.findMany({ select: { id: true, apiFootballId: true } }))
    .forEach(p => playerMap.set(p.apiFootballId, p.id));

  try {
    // Run sequentially to respect rate limit (each step makes 1 API call)
    await enrichPlayerStats(prisma, matchId, fixtureId, teamMap, playerMap).catch(logWarn);
    await enrichMatchEvents(prisma, matchId, fixtureId, teamMap, playerMap).catch(logWarn);
    await enrichLineups(prisma, matchId, fixtureId, teamMap, playerMap).catch(logWarn);
    await enrichTeamStats(prisma, matchId, fixtureId, teamMap).catch(logWarn);

    await calculatePlayerOfMatch(prisma, matchId);

    await prisma.match.update({
      where: { id: matchId },
      data:  { enrichStatus: 'FULLY_ENRICHED' },
    });

    return true;
  } catch (err: any) {
    if (err instanceof DailyLimitError) throw err;
    console.warn(`    [WARN] enrichMatch failed for matchId=${matchId}: ${err?.message ?? err}`);
    return false;
  }
}

function logWarn(err: any) {
  if (err instanceof DailyLimitError) throw err;
  console.warn(`    [WARN] enrichment step failed: ${err?.message ?? err}`);
}
