import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

// =============================================================================
// CopaFut Seed Orchestrator
// Run: npx ts-node prisma/seed/index.ts [step...]
//
// Steps (in dependency order):
//   reference   — confederations, countries, teams, competitions, players, coaches
//   matches     — fixtures by league + by team (friendlies), calendar, enrichment
//   stats       — standings, team season stats, player season stats
//   predictions — ML predictions (requires ML service running)
//
// Examples:
//   npx ts-node prisma/seed/index.ts              # run all steps
//   npx ts-node prisma/seed/index.ts reference    # only step 1
//   npx ts-node prisma/seed/index.ts matches stats # steps 2 + 3
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { DailyLimitError } from './api';
import { seedReference }   from './seeders/01-reference';
import { seedMatches }     from './seeders/02-matches';
import { seedStats }       from './seeders/03-stats';
import { seedPredictions } from './seeders/04-predictions';

const prisma = new PrismaClient();

async function main() {
  console.log('CopaFut Seed Starting...\n');

  const args   = process.argv.slice(2);
  const runAll = args.length === 0;
  const run    = (name: string) => runAll || args.includes(name);

  try {
    if (run('reference'))   await seedReference(prisma);
    if (run('matches'))     await seedMatches(prisma);
    if (run('stats'))       await seedStats(prisma);
    if (run('predictions')) await seedPredictions(prisma);

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
