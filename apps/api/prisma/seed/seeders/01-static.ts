// =============================================================================
// Seeder 01: Static Data — Confederations + Countries
// No API calls needed
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { CONFEDERATIONS, TEAMS } from '../config';

export async function seedStatic(prisma: PrismaClient) {
  console.log('\nSeeding confederations...');

  for (const conf of CONFEDERATIONS) {
    await prisma.confederation.upsert({
      where:  { code: conf.code },
      update: { name: conf.name },
      create: { code: conf.code, name: conf.name },
    });
    console.log(`  [OK] ${conf.code}`);
  }

  console.log('\nSeeding countries...');

  const confMap = new Map<string, number>();
  const confs = await prisma.confederation.findMany();
  confs.forEach(c => confMap.set(c.code, c.id));

  for (const team of TEAMS) {
    const confederationId = confMap.get(team.confederation)!;

    // iso2 is not unique (GB is shared by England, Scotland, Wales)
    // so we upsert by iso3 which is always unique
    await prisma.country.upsert({
      where:  { isoAlpha3: team.iso3 },
      update: { name: team.countryName, isoAlpha2: team.iso2, confederationId },
      create: { name: team.countryName, isoAlpha2: team.iso2, isoAlpha3: team.iso3, confederationId },
    });
    console.log(`  [OK] ${team.countryName} (${team.iso3})`);
  }
}
