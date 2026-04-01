import * as dotenv from 'dotenv';
import * as path from 'path';
// Load from apps/api/.env first, then fall back to root .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

// =============================================================================
// NITBox Seed Orchestrator
// Run: npx ts-node prisma/seed/index.ts
//
// Order matters — respects foreign key constraints:
// 01 static → 02 teams → 03 competitions → 04 fixtures → 05 players →
// 06 standings → 07 player-season-stats → 08 coaches
//
// 07 is a pure DB aggregation (no API requests)
// 08 coaches: ~60 requests (1 per team)
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { DailyLimitError } from './api';
import { seedStatic }            from './seeders/01-static';
import { seedTeams }             from './seeders/02-teams';
import { seedCompetitions }      from './seeders/03-competitions';
import { seedFixtures }          from './seeders/04-fixtures';
import { seedPlayers }           from './seeders/05-players';
import { seedStandings }         from './seeders/06-standings';
import { seedPlayerSeasonStats } from './seeders/07-player-season-stats';
import { seedCoaches }           from './seeders/08-coaches';

const prisma = new PrismaClient();

async function main() {
  console.log('NITBox Seed Starting...\n');

  const args = process.argv.slice(2);
  const runAll = args.length === 0;

  const run = (name: string) => runAll || args.includes(name);

  try {
    if (run('static'))              await seedStatic(prisma);
    if (run('teams'))               await seedTeams(prisma);
    if (run('competitions'))        await seedCompetitions(prisma);
    if (run('players'))             await seedPlayers(prisma);
    if (run('fixtures'))            await seedFixtures(prisma);
    if (run('standings'))           await seedStandings(prisma);
    if (run('player-season-stats')) await seedPlayerSeasonStats(prisma);
    if (run('coaches'))             await seedCoaches(prisma);

    console.log('\nSeed complete!\n');
  } catch (err) {
    if (err instanceof DailyLimitError) {
      console.error('\n[STOP] Daily API limit reached. Progress saved. Run again tomorrow.');
      process.exit(0);
    }
    console.error('\nSeed failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
