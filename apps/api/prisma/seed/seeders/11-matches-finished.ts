// =============================================================================
// Seeder 11: Matches Finished — enriches all FT/AET/PEN matches that are
//            not yet FULLY_ENRICHED.
//
// This is the most critical seeder for the ML pipeline.
// Without complete player stats, team stats, lineups, and events for every
// finished match, the feature engineering in Sprint 3 is unreliable.
//
// What it does:
//   1. Finds every match with statusShort IN ('FT','AET','PEN') and
//      enrichStatus != 'FULLY_ENRICHED'.
//   2. For each match, runs the full enrichment:
//        - /fixtures/players  → PlayerMatchStats
//        - /fixtures/events   → MatchEvent
//        - /fixtures/lineups  → MatchLineup + LineupPlayer
//        - /fixtures/statistics → MatchTeamStatistics
//        - NitboxAward PLAYER_OF_MATCH calculation
//   3. Sets enrichStatus = FULLY_ENRICHED on success.
//
// Idempotent: safe to re-run. Each enrichment step skips or upserts
// existing rows. Matches already at FULLY_ENRICHED are skipped entirely.
//
// API cost: ~4 requests per match (players, events, lineups, stats).
//           With 7,500 req/day limit, handles ~1,875 matches per run.
//           Progress is saved on DailyLimitError — re-run tomorrow to continue.
//
// Run: npm run seed:matches-finished
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { DailyLimitError } from '../api';
import { enrichMatch } from '../helpers/enrich-match';

const FINAL_STATUSES = ['FT', 'AET', 'PEN'];

export async function seedMatchesFinished(prisma: PrismaClient) {
  console.log('\nSeeding finished matches enrichment...');

  // Pre-load team map: apiFootballId → db id
  const teamMap = new Map<number, number>();
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  // Find all finished matches that haven't been fully enriched yet
  const pending = await prisma.match.findMany({
    where: {
      statusShort:  { in: FINAL_STATUSES },
      enrichStatus: { not: 'FULLY_ENRICHED' },
    },
    select: {
      id:            true,
      apiFootballId: true,
      homeTeam:      { select: { id: true, apiFootballId: true, name: true } },
      awayTeam:      { select: { id: true, apiFootballId: true, name: true } },
      statusShort:   true,
      enrichStatus:  true,
      kickoffAt:     true,
    },
    orderBy: { kickoffAt: 'asc' },
  });

  if (!pending.length) {
    console.log('  All finished matches are already FULLY_ENRICHED. Nothing to do.');
    return;
  }

  console.log(`  Found ${pending.length} match(es) pending enrichment.`);

  let enriched = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const match of pending) {
    const matchTeamMap = new Map([
      [match.homeTeam.apiFootballId, match.homeTeam.id],
      [match.awayTeam.apiFootballId, match.awayTeam.id],
    ]);

    const label = `${match.homeTeam.name} vs ${match.awayTeam.name} (${match.kickoffAt?.toISOString().slice(0, 10)})`;
    console.log(`\n  [${enriched + failed + skipped + 1}/${pending.length}] ${label}`);
    console.log(`    enrichStatus: ${match.enrichStatus} → FULLY_ENRICHED`);

    try {
      const didEnrich = await enrichMatch(prisma, match.id, match.apiFootballId, matchTeamMap);

      if (didEnrich) {
        enriched++;
        console.log(`    [OK] enriched ✓`);
      } else {
        skipped++;
        console.log(`    [SKIP] already FULLY_ENRICHED`);
      }
    } catch (err: any) {
      if (err instanceof DailyLimitError) {
        console.error(`\n  [STOP] Daily API limit reached.`);
        console.error(`  Progress saved: ${enriched} enriched, ${failed} failed, ${skipped} skipped.`);
        console.error(`  Re-run tomorrow to continue from where we left off.`);
        throw err;
      }

      failed++;
      console.warn(`    [FAIL] ${err?.message ?? err}`);
    }
  }

  console.log(`\n  Finished matches enrichment complete.`);
  console.log(`  Enriched: ${enriched}  |  Skipped (already done): ${skipped}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.log(`  Tip: re-run seed:matches-finished to retry the ${failed} failed match(es).`);
  }
}
