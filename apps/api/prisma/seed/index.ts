// =============================================================================
// NITBox Seed Orchestrator
// Run: npx ts-node prisma/seed/index.ts
//
// Order matters — respects foreign key constraints:
// 01 static → 02 teams → 03 competitions → 04 fixtures → 05 players → 06 standings
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { seedStatic }       from './seeders/01-static';
import { seedTeams }        from './seeders/02-teams';
import { seedCompetitions } from './seeders/03-competitions';
import { seedFixtures }     from './seeders/04-fixtures';
import { seedPlayers }      from './seeders/05-players';
import { seedStandings }    from './seeders/06-standings';

const prisma = new PrismaClient();

async function main() {
  console.log('NITBox Seed Starting...\n');
  console.log('WARNING:  Free plan: 100 requests/day — run seeders in phases if needed\n');

  const args = process.argv.slice(2);
  const runAll = args.length === 0;

  const run = (name: string) => runAll || args.includes(name);

  try {
    if (run('static'))       await seedStatic(prisma);
    if (run('teams'))        await seedTeams(prisma);
    if (run('competitions')) await seedCompetitions(prisma);
    if (run('players'))      await seedPlayers(prisma);
    if (run('fixtures'))     await seedFixtures(prisma);
    if (run('standings'))    await seedStandings(prisma);

    console.log('\nSeed complete!\n');
  } catch (err) {
    console.error('\nSeed failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
