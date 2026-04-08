// =============================================================================
// Backfill: Full Player Bio Refresh
// Fetches ALL players individually from API-Football to ensure fresh data.
// Updates: name, photo, DOB, height, weight, position, nationality, injury status
//
// ~2230 players × 1.5s ≈ 56 minutes
// Run: npx tsx prisma/seed/backfill-player-bio-individual.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from './api';

const prisma = new PrismaClient();

const SEASONS = [2024, 2023, 2022];

interface ApiPlayerResponse {
  player: {
    id: number;
    firstname: string;
    lastname: string;
    name: string;
    birth: { date: string | null; place: string | null; country: string | null };
    nationality: string | null;
    height: string | null;
    weight: string | null;
    injured: boolean;
    photo: string | null;
  };
}

function parseCm(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^\d]/g, ''));
  return isNaN(n) ? null : n;
}

function normalizePosition(pos: string | null): string {
  if (!pos) return 'MID';
  const p = pos.toLowerCase();
  if (p.includes('goalkeeper') || p === 'gk') return 'GK';
  if (p.includes('defender') || p === 'cb' || p === 'lb' || p === 'rb' || p === 'def') return 'DEF';
  if (p.includes('midfielder') || p === 'mid' || p === 'cm' || p === 'dm' || p === 'am') return 'MID';
  if (p.includes('attacker') || p.includes('forward') || p === 'fw' || p === 'st' || p === 'lw' || p === 'rw') return 'FWD';
  return 'MID';
}

async function main() {
  console.log('🔄 Full player bio refresh starting...\n');

  const allPlayers = await prisma.player.findMany({
    select: { id: true, apiFootballId: true, commonName: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Total players to refresh: ${allPlayers.length}\n`);

  const countries = await prisma.country.findMany({ select: { id: true, name: true } });
  const countryMap = new Map(countries.map(c => [c.name, c.id]));

  let totalFixed = 0;
  let totalNoData = 0;
  let totalErrors = 0;

  for (let i = 0; i < allPlayers.length; i++) {
    const { id: dbId, apiFootballId, commonName } = allPlayers[i];
    const pct = Math.round(((i + 1) / allPlayers.length) * 100);

    process.stdout.write(`[${i + 1}/${allPlayers.length}] (${pct}%) ${commonName} ... `);

    let updated = false;

    for (const season of SEASONS) {
      if (updated) break;

      try {
        const results = await apiGet<ApiPlayerResponse>('players', {
          id: apiFootballId,
          season,
        });

        if (!results.length) continue;

        const p = results[0].player;

        const birthDate   = p.birth?.date ? new Date(p.birth.date) : null;
        const height      = parseCm(p.height);
        const weight      = parseCm(p.weight);
        const nationalityId = p.nationality
          ? (countryMap.get(p.nationality) ?? null)
          : null;
        const birthCountryId = p.birth?.country
          ? (countryMap.get(p.birth.country) ?? null)
          : null;

        await prisma.player.update({
          where: { id: dbId },
          data: {
            ...(p.firstname                  ? { firstName: p.firstname }                    : {}),
            ...(p.lastname                   ? { lastName: p.lastname }                      : {}),
            ...(p.name                       ? { commonName: p.name }                        : {}),
            ...(p.photo                      ? { photoUrl: p.photo }                         : {}),
            ...(birthDate                    ? { dateOfBirth: birthDate }                    : { dateOfBirth: null }),
            ...(p.birth?.place               ? { birthPlace: p.birth.place }                : {}),
            ...(birthCountryId               ? { birthCountryId }                            : {}),
            ...(nationalityId                ? { nationalityId }                             : {}),
            ...(height !== null              ? { heightCm: height }                          : {}),
            ...(weight !== null              ? { weightKg: weight }                          : {}),
            ...(typeof p.injured === 'boolean' ? { isInjured: p.injured }                   : {}),
          },
        });

        process.stdout.write(`✓ (${season})\n`);
        totalFixed++;
        updated = true;
      } catch (err: any) {
        process.stdout.write(`✗ ${err.message}\n`);
        totalErrors++;
        break;
      }
    }

    if (!updated && totalErrors === 0) {
      process.stdout.write(`— no data\n`);
      totalNoData++;
    }

    // Progress summary every 100 players
    if ((i + 1) % 100 === 0) {
      const elapsed = Math.round((i + 1) * 1.5 / 60);
      const remaining = Math.round((allPlayers.length - i - 1) * 1.5 / 60);
      console.log(`\n📊 ${totalFixed} updated | ${totalNoData} no data | ${totalErrors} errors | ~${remaining} min left\n`);
    }
  }

  console.log('\n========================================');
  console.log(`✅ Updated:  ${totalFixed} players`);
  console.log(`⚠️  No data:  ${totalNoData} players`);
  console.log(`❌ Errors:   ${totalErrors} players`);
  console.log('========================================\n');

  // Set remaining placeholder dates to NULL via raw SQL (bypasses non-nullable type)
  const result = await prisma.$executeRaw`
    UPDATE players SET "dateOfBirth" = NULL WHERE "dateOfBirth" = '1990-01-01'
  `;
  console.log(`🧹 Cleared ${result} remaining placeholder dates (1990-01-01 → NULL)\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
