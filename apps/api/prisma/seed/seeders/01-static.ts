// =============================================================================
// Seeder 01: Static Data — Confederations + Countries
// No API calls needed
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { CONFEDERATIONS, COUNTRIES } from '../config';

export async function seedStatic(prisma: PrismaClient) {
  console.log('\nSeeding confederations...');

  // Upsert confederations
  for (const conf of CONFEDERATIONS) {
    await prisma.confederation.upsert({
      where: { code: conf.code },
      update: { name: conf.name },
      create: { code: conf.code, name: conf.name },
    });
    console.log(`  [OK] ${conf.code}`);
  }

  console.log('\nSeeding countries...');

  // Load confederation IDs
  const confMap = new Map<string, number>();
  const confs = await prisma.confederation.findMany();
  confs.forEach(c => confMap.set(c.code, c.id));

  // Upsert countries — use iso3 as stable unique key since some share iso2 (GB)
  for (const [name, iso2, iso3, confCode] of COUNTRIES) {
    const confederationId = confMap.get(confCode)!;
    await prisma.country.upsert({
      where: { isoAlpha3: iso3 },
      update: { name, isoAlpha2: iso2, confederationId },
      create: { name, isoAlpha2: iso2, isoAlpha3: iso3, confederationId },
    });
    console.log(`  [OK] ${name} (${iso3})`);
  }
}
