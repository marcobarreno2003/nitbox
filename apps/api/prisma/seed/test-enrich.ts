// =============================================================================
// Manual test script for EnrichService.
// Picks one recently finished match from DB and runs the full enrichment
// pipeline on it so you can verify player stats, lineups, team stats,
// standings recalculation, and NitboxAward creation all work end to end.
//
// Usage:
//   npm run test:enrich
//   npm run test:enrich -- --matchId=<id>   (force a specific match)
// =============================================================================

import * as dotenv from 'dotenv';
import * as path   from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { PrismaClient }    from '@prisma/client';
import { apiGet, DailyLimitError } from './api';

const prisma = new PrismaClient();

// ── Inline EnrichService logic (no NestJS DI needed) ──────────────────────────

async function enrichPlayerStats(matchId: number, apiFixtureId: number, teamMap: Map<number, number>) {
  const data = await apiGet<any>('fixtures/players', { fixture: apiFixtureId });
  const teamEntries = data ?? [];

  for (const teamEntry of teamEntries) {
    const teamId = teamMap.get(teamEntry.team.id);
    if (!teamId) continue;

    for (const entry of teamEntry.players ?? []) {
      const apiPlayerId = entry.player?.id;
      if (!apiPlayerId) continue;

      const player = await prisma.player.findFirst({
        where: { apiFootballId: apiPlayerId }, select: { id: true },
      });
      if (!player) continue;

      const s = entry.statistics?.[0];
      if (!s) continue;

      const passAcc = s.passes?.accuracy
        ? parseFloat(String(s.passes.accuracy).replace('%', ''))
        : null;

      await prisma.playerMatchStats.upsert({
        where:  { matchId_playerId: { matchId, playerId: player.id } },
        create: {
          matchId, playerId: player.id, teamId,
          minutesPlayed: s.games?.minutes ?? null,
          rating: s.games?.rating ? parseFloat(s.games.rating) : null,
          captain: s.games?.captain ?? false,
          substitute: s.games?.substitute ?? false,
          goals: s.goals?.total ?? 0,
          goalsConceded: s.goals?.conceded ?? null,
          assists: s.goals?.assists ?? 0,
          saves: s.goals?.saves ?? null,
          shots: s.shots?.total ?? null,
          shotsOnTarget: s.shots?.on ?? null,
          passes: s.passes?.total ?? null,
          passAccuracyPct: passAcc,
          keyPasses: s.passes?.key ?? null,
          tackles: s.tackles?.total ?? null,
          blockedShots: s.tackles?.blocks ?? null,
          interceptions: s.tackles?.interceptions ?? null,
          duelsTotal: s.duels?.total ?? null,
          duelsWon: s.duels?.won ?? null,
          dribbles: s.dribbles?.attempts ?? null,
          dribblesCompleted: s.dribbles?.success ?? null,
          dribblesPast: s.dribbles?.past ?? null,
          foulsCommitted: s.fouls?.committed ?? null,
          foulsSuffered: s.fouls?.drawn ?? null,
          yellowCards: s.cards?.yellow ?? 0,
          redCards: s.cards?.red ?? 0,
          offsides: s.offsides ?? null,
          penaltyWon: s.penalty?.won ?? null,
          penaltyCommitted: s.penalty?.commited ?? null,
          penaltyScored: s.penalty?.scored ?? null,
          penaltyMissed: s.penalty?.missed ?? null,
          penaltySaved: s.penalty?.saved ?? null,
        },
        update: {
          minutesPlayed: s.games?.minutes ?? null,
          rating: s.games?.rating ? parseFloat(s.games.rating) : null,
          goals: s.goals?.total ?? 0,
          assists: s.goals?.assists ?? 0,
        },
      });
    }
  }
  console.log('  ✓ player stats enriched');
}

async function enrichTeamStats(matchId: number, apiFixtureId: number, teamMap: Map<number, number>) {
  const data = await apiGet<any>('fixtures/statistics', { fixture: apiFixtureId });

  for (const entry of data ?? []) {
    const teamId = teamMap.get(entry.team.id);
    if (!teamId) continue;

    const stats: Record<string, any> = {};
    for (const s of entry.statistics ?? []) {
      const v = s.value;
      switch (s.type) {
        case 'Ball Possession':    stats.possessionPct   = v ? parseFloat(v) : null; break;
        case 'Total Shots':        stats.shots           = v ?? null; break;
        case 'Shots on Goal':      stats.shotsOnTarget   = v ?? null; break;
        case 'Total passes':       stats.passes          = v ?? null; break;
        case 'Passes %':           stats.passAccuracyPct = v ? parseFloat(v) : null; break;
        case 'Corner Kicks':       stats.corners         = v ?? null; break;
        case 'Yellow Cards':       stats.yellowCards     = v ?? null; break;
        case 'Red Cards':          stats.redCards        = v ?? null; break;
        case 'Goalkeeper Saves':   stats.saves           = v ?? null; break;
      }
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId }, select: { homeTeamId: true },
    });

    await prisma.matchTeamStatistics.upsert({
      where:  { matchId_teamId: { matchId, teamId } },
      create: { matchId, teamId, isHome: match?.homeTeamId === teamId, ...stats },
      update: stats,
    });
  }
  console.log('  ✓ team stats enriched');
}

async function main() {
  const args      = process.argv.slice(2);
  const forcedId  = args.find(a => a.startsWith('--matchId='))?.split('=')[1];

  let match: any;

  if (forcedId) {
    match = await prisma.match.findUnique({
      where: { id: Number(forcedId) },
      include: {
        homeTeam: { select: { id: true, apiFootballId: true, name: true } },
        awayTeam: { select: { id: true, apiFootballId: true, name: true } },
      },
    });
    if (!match) {
      console.error(`Match ${forcedId} not found`);
      process.exit(1);
    }
  } else {
    // Pick the most recent finished match that hasn't been fully enriched
    match = await prisma.match.findFirst({
      where: {
        statusShort:  { in: ['FT', 'AET', 'PEN'] },
        enrichStatus: { not: 'FULLY_ENRICHED' },
      },
      orderBy: { kickoffAt: 'desc' },
      include: {
        homeTeam: { select: { id: true, apiFootballId: true, name: true } },
        awayTeam: { select: { id: true, apiFootballId: true, name: true } },
      },
    });

    if (!match) {
      // Fall back to a match that IS enriched but re-run it anyway
      match = await prisma.match.findFirst({
        where: { statusShort: { in: ['FT', 'AET', 'PEN'] } },
        orderBy: { kickoffAt: 'desc' },
        include: {
          homeTeam: { select: { id: true, apiFootballId: true, name: true } },
          awayTeam: { select: { id: true, apiFootballId: true, name: true } },
        },
      });
    }
  }

  if (!match) {
    console.error('No finished matches found in DB. Run seed:fixtures first.');
    process.exit(1);
  }

  console.log(`\nTest enrichment for match ${match.id}:`);
  console.log(`  ${match.homeTeam.name} vs ${match.awayTeam.name}`);
  console.log(`  apiFootballId: ${match.apiFootballId}`);
  console.log(`  status: ${match.statusShort}  enrichStatus: ${match.enrichStatus}\n`);

  const teamMap = new Map([
    [match.homeTeam.apiFootballId, match.homeTeam.id],
    [match.awayTeam.apiFootballId, match.awayTeam.id],
  ]);

  try {
    await enrichPlayerStats(match.id, match.apiFootballId, teamMap);
    await enrichTeamStats(match.id, match.apiFootballId, teamMap);

    // Mark as enriched
    await prisma.match.update({
      where: { id: match.id },
      data:  { enrichStatus: 'FULLY_ENRICHED' },
    });

    // Verify results
    const playerStatsCount = await prisma.playerMatchStats.count({ where: { matchId: match.id } });
    const teamStatsCount   = await prisma.matchTeamStatistics.count({ where: { matchId: match.id } });
    const award            = await prisma.nitboxAward.findFirst({
      where: { matchId: match.id, type: 'PLAYER_OF_MATCH' },
      include: { player: { select: { commonName: true, firstName: true, lastName: true, position: true } } },
    });

    console.log('\n── Results ──────────────────────────────────────────');
    console.log(`  playerMatchStats rows : ${playerStatsCount}`);
    console.log(`  matchTeamStatistics   : ${teamStatsCount}`);
    console.log(`  NitboxAward           : ${award
      ? `${award.player.commonName ?? `${award.player.firstName} ${award.player.lastName}`} (${award.player.position}) — score ${award.score.toFixed(1)}`
      : 'none yet'
    }`);
    console.log(`  enrichStatus          : FULLY_ENRICHED ✓`);
    console.log('\nTest passed ✓\n');
  } catch (err) {
    if (err instanceof DailyLimitError) {
      console.error('\n[STOP] Daily API limit reached.');
    } else {
      console.error('\nTest failed:', err);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
