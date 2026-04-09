// =============================================================================
// Shared match enrichment helpers used by multiple seeders.
//
// Called after a match reaches FT / AET / PEN status to persist the full
// post-match dataset: player stats, lineups, team stats, events, and the
// PLAYER_OF_MATCH NitboxAward.
//
// All functions are idempotent — they check for existing rows and skip or
// upsert accordingly, so they are safe to call multiple times.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, DailyLimitError } from '../api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiStatEntry { type: string; value: string | number | null }

interface ApiEvent {
  time:   { elapsed: number; extra: number | null };
  team:   { id: number };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
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
): Promise<void> {
  // Idempotent: skip if already populated (update path handles re-runs)
  const teamStats = await apiGet<ApiPlayerStatsResponse>('fixtures/players', { fixture: fixtureId });

  for (const ts of teamStats) {
    const teamDbId = teamMap.get(ts.team.id);
    if (!teamDbId) continue;

    for (const entry of ts.players) {
      if (!entry.player?.id) continue;

      const player = await prisma.player.findUnique({ where: { apiFootballId: entry.player.id } });
      if (!player) continue;

      const s = entry.statistics[0];
      if (!s) continue;

      const rating      = s.games.rating    ? parseFloat(s.games.rating) : null;
      const passAcc     = s.passes.accuracy ? parseFloat(String(s.passes.accuracy).replace('%', '')) : null;

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
        keyPasses:         s.passes.key,
        passAccuracyPct:   (passAcc !== null && !isNaN(passAcc)) ? passAcc : null,
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
        redCards:          s.cards.red    ?? 0,
        offsides:          s.offsides,
        penaltyWon:        s.penalty.won,
        penaltyCommitted:  s.penalty.commited,
        penaltyScored:     s.penalty.scored,
        penaltyMissed:     s.penalty.missed,
        penaltySaved:      s.penalty.saved,
      };

      await prisma.playerMatchStats.upsert({
        where:  { matchId_playerId: { matchId, playerId: player.id } },
        create: { matchId, playerId: player.id, teamId: teamDbId, ...playerStatFields },
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
): Promise<void> {
  const events = await apiGet<ApiEvent>('fixtures/events', { fixture: fixtureId });

  // Events are immutable after FT — skip if API returned the same count we already have
  const existing = await prisma.matchEvent.count({ where: { matchId } });
  if (existing > 0 && existing === events.length) return;

  // Delete and recreate if count differs (partial save from a previous run)
  if (existing > 0) {
    await prisma.matchEvent.deleteMany({ where: { matchId } });
  }

  for (const e of events) {
    const teamDbId = teamMap.get(e.team.id);
    if (!teamDbId) continue;

    let playerDbId: number | null = null;
    let assistDbId:  number | null = null;

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
        teamId:         teamDbId,
        playerId:       playerDbId,
        assistPlayerId: assistDbId,
        minute:         e.time.elapsed,
        extraTime:      e.time.extra,
        type:           e.type,
        detail:         e.detail,
        comments:       e.comments,
      },
    });
  }
}

// ── Lineups ───────────────────────────────────────────────────────────────────

export async function enrichLineups(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
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
      const player = await prisma.player.findUnique({ where: { apiFootballId: lp.id } });
      if (!player) continue;

      await prisma.lineupPlayer.upsert({
        where:  { lineupId_playerId: { lineupId: matchLineup.id, playerId: player.id } },
        create: {
          lineupId:     matchLineup.id,
          playerId:     player.id,
          shirtNumber:  lp.number   ?? null,
          positionCode: lp.pos      ?? null,
          gridPosition: lp.grid     ?? null,
          isStarter:    lp.isStarter,
        },
        update: {
          shirtNumber:  lp.number   ?? null,
          positionCode: lp.pos      ?? null,
          gridPosition: lp.grid     ?? null,
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
      create: { matchId, teamId: teamDbId, isHome: false, ...teamStatFields },
      update: teamStatFields,
    });
  }

  // Fix isHome flag — resolve from match record
  const match = await prisma.match.findUnique({
    where:  { id: matchId },
    select: { homeTeamId: true, awayTeamId: true },
  });
  if (!match) return;

  await prisma.matchTeamStatistics.updateMany({
    where: { matchId, teamId: match.homeTeamId },
    data:  { isHome: true },
  });
  await prisma.matchTeamStatistics.updateMany({
    where: { matchId, teamId: match.awayTeamId },
    data:  { isHome: false },
  });
}

// ── NitboxAward: Player of the Match ─────────────────────────────────────────
// Formula (position-aware, normalized to 90 min):
//   Outfield: goals*20 + assists*12 + keyPasses*3 + rating*5 + tackles*2 + interceptions*2
//   GK:       saves*15 + rating*7 + (cleanSheet ? 20 : 0) + tackles*2

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

    const isGK   = ps.player.position === 'G' || ps.player.position === 'GK';
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

    // Normalize to 90 minutes
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
// Runs all four enrichment steps + NitboxAward + sets FULLY_ENRICHED.
// Returns true if enrichment ran, false if already done.

export async function enrichMatch(
  prisma:    PrismaClient,
  matchId:   number,
  fixtureId: number,
  teamMap:   Map<number, number>,
): Promise<boolean> {
  // Check current enrichment status
  const match = await prisma.match.findUnique({
    where:  { id: matchId },
    select: { enrichStatus: true },
  });

  if (match?.enrichStatus === 'FULLY_ENRICHED') return false;

  try {
    // Run all four enrichment steps — errors in individual steps are logged
    // but don't abort the others (some fixtures genuinely lack certain data)
    const results = await Promise.allSettled([
      enrichPlayerStats(prisma, matchId, fixtureId, teamMap),
      enrichMatchEvents(prisma, matchId, fixtureId, teamMap),
      enrichLineups(prisma, matchId, fixtureId, teamMap),
      enrichTeamStats(prisma, matchId, fixtureId, teamMap),
    ]);

    for (const r of results) {
      if (r.status === 'rejected') {
        if (r.reason instanceof DailyLimitError) throw r.reason;
        console.warn(`    [WARN] enrichment step failed: ${r.reason?.message ?? r.reason}`);
      }
    }

    // Calculate NitboxAward after player stats are in
    await calculatePlayerOfMatch(prisma, matchId);

    // Mark as fully enriched
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
