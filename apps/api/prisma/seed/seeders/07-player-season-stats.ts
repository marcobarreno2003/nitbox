// =============================================================================
// Seeder 07: Player Season Stats (computed — no API requests)
// Source: aggregated from player_match_stats + matches
//
// For each (player, competitionSeason, team) group:
//   SUM  goals, assists, shots, shotsOnTarget, passes, passesCompleted,
//        keyPasses, dribbles, dribblesCompleted, tackles, interceptions,
//        clearances, foulsCommitted, foulsSuffered, saves,
//        yellowCards, redCards, penaltyScored, penaltyMissed
//   AVG  rating
//   COUNT appearances (minutesPlayed > 0)
//   COUNT starts (substitute = false)
//   SUM  minutesPlayed
//
// Skip logic: skip (player, competitionSeason, team) tuple already in DB
// =============================================================================

import { PrismaClient } from '@prisma/client';

export async function seedPlayerSeasonStats(prisma: PrismaClient) {
  console.log('\nComputing player season stats from match data...');

  // Fetch all player match stats joined to match → competitionSeasonId
  const allStats = await prisma.playerMatchStats.findMany({
    include: {
      match: { select: { competitionSeasonId: true } },
    },
  });

  if (!allStats.length) {
    console.log('  [SKIP] No player match stats found — run fixtures seeder first');
    return;
  }

  // Group by (playerId, competitionSeasonId, teamId)
  type GroupKey = string;
  const groups = new Map<GroupKey, typeof allStats>();

  for (const s of allStats) {
    const key: GroupKey = `${s.playerId}-${s.match.competitionSeasonId}-${s.teamId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  let created = 0;
  let skipped = 0;

  for (const [key, rows] of groups) {
    const [playerIdStr, csIdStr, teamIdStr] = key.split('-');
    const playerId           = parseInt(playerIdStr);
    const competitionSeasonId = parseInt(csIdStr);
    const teamId             = parseInt(teamIdStr);

    // Skip if already computed
    const existing = await prisma.playerSeasonStats.findUnique({
      where: { playerId_competitionSeasonId_teamId: { playerId, competitionSeasonId, teamId } },
    });
    if (existing) { skipped++; continue; }

    const appearances   = rows.filter(r => (r.minutesPlayed ?? 0) > 0).length;
    const starts        = rows.filter(r => !r.substitute).length;
    const minutesPlayed = rows.reduce((sum, r) => sum + (r.minutesPlayed ?? 0), 0);
    const goals         = rows.reduce((sum, r) => sum + (r.goals ?? 0), 0);
    const assists       = rows.reduce((sum, r) => sum + (r.assists ?? 0), 0);
    const shots         = nullSum(rows.map(r => r.shots));
    const shotsOnTarget = nullSum(rows.map(r => r.shotsOnTarget));
    const passes        = nullSum(rows.map(r => r.passes));
    const passesCompleted = nullSum(rows.map(r => r.passesCompleted));
    const keyPasses     = nullSum(rows.map(r => r.keyPasses));
    const dribbles      = nullSum(rows.map(r => r.dribbles));
    const dribblesCompleted = nullSum(rows.map(r => r.dribblesCompleted));
    const tackles       = nullSum(rows.map(r => r.tackles));
    const interceptions = nullSum(rows.map(r => r.interceptions));
    const clearances    = nullSum(rows.map(r => r.clearances));
    const foulsCommitted = nullSum(rows.map(r => r.foulsCommitted));
    const foulsSuffered = nullSum(rows.map(r => r.foulsSuffered));
    const saves         = nullSum(rows.map(r => r.saves));
    const yellowCards   = rows.reduce((sum, r) => sum + (r.yellowCards ?? 0), 0);
    const redCards      = rows.reduce((sum, r) => sum + (r.redCards ?? 0), 0);
    const penaltyScored = nullSum(rows.map(r => r.penaltyScored));
    const penaltyMissed = nullSum(rows.map(r => r.penaltyMissed));

    const ratedRows  = rows.filter(r => r.rating !== null);
    const averageRating = ratedRows.length
      ? ratedRows.reduce((sum, r) => sum + r.rating!, 0) / ratedRows.length
      : null;

    await prisma.playerSeasonStats.create({
      data: {
        playerId,
        competitionSeasonId,
        teamId,
        appearances,
        starts,
        minutesPlayed,
        goals,
        assists,
        shots,
        shotsOnTarget,
        passes,
        passesCompleted,
        keyPasses,
        dribbles,
        dribblesCompleted,
        tackles,
        interceptions,
        clearances,
        foulsCommitted,
        foulsSuffered,
        saves,
        yellowCards,
        redCards,
        penaltyScored,
        penaltyMissed,
        averageRating: averageRating ? parseFloat(averageRating.toFixed(2)) : null,
      },
    });

    created++;
  }

  console.log(`  [OK] ${created} records created, ${skipped} skipped`);
}

function nullSum(values: (number | null | undefined)[]): number | null {
  const valid = values.filter(v => v !== null && v !== undefined) as number[];
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}
