// =============================================================================
// Backfill: Player Bio Data
// Fixes players where dateOfBirth = '1990-01-01' OR heightCm IS NULL
// caused by seeder update block not including bio fields.
//
// Strategy: fetch by team × season (60 teams × 3 seasons = ~180 API calls)
// instead of by player (1600+ calls)
// Run: npx tsx prisma/seed/backfill-player-bio.ts
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
  };
}

function parseCm(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^\d]/g, ''));
  return isNaN(n) ? null : n;
}

async function fixPlayers(
  profiles: ApiPlayerResponse[],
  badPlayerMap: Map<number, number>,
  countryMap: Map<string, number>,
): Promise<number> {
  let fixed = 0;
  for (const { player: p } of profiles) {
    const dbId = badPlayerMap.get(p.id);
    if (!dbId) continue;

    const birthDate = p.birth?.date ? new Date(p.birth.date) : null;
    const height = parseCm(p.height);
    if (!birthDate && height === null) continue;

    const birthCountryId = p.birth?.country
      ? (countryMap.get(p.birth.country) ?? null)
      : null;

    await prisma.player.update({
      where: { id: dbId },
      data: {
        ...(birthDate ? { dateOfBirth: birthDate } : {}),
        ...(p.birth?.place ? { birthPlace: p.birth.place } : {}),
        ...(birthCountryId ? { birthCountryId } : {}),
        ...(height !== null ? { heightCm: height } : {}),
        ...(parseCm(p.weight) !== null ? { weightKg: parseCm(p.weight) } : {}),
      },
    });

    badPlayerMap.delete(p.id);
    fixed++;
  }
  return fixed;
}

async function main() {
  console.log('🔍 Finding teams with players that have bad bio data...');

  const teamsWithBadPlayers = await prisma.$queryRaw<{ teamApiId: number; teamName: string }[]>`
    SELECT DISTINCT nt."apiFootballId" AS "teamApiId", nt.name AS "teamName"
    FROM national_teams nt
    JOIN squads s ON s."teamId" = nt.id
    JOIN squad_players sp ON sp."squadId" = s.id
    JOIN players p ON p.id = sp."playerId"
    WHERE p."dateOfBirth" = '1990-01-01'
       OR p."heightCm" IS NULL
    ORDER BY nt.name
  `;

  console.log(`Found ${teamsWithBadPlayers.length} teams to process across ${SEASONS.join(', ')}\n`);

  const allBadPlayers = await prisma.player.findMany({
    where: {
      OR: [
        { dateOfBirth: new Date('1990-01-01') },
        { heightCm: null },
      ],
    },
    select: { id: true, apiFootballId: true },
  });

  const badPlayerMap = new Map(allBadPlayers.map(p => [p.apiFootballId, p.id]));
  console.log(`Total players needing fix: ${badPlayerMap.size}\n`);

  const countries = await prisma.country.findMany({ select: { id: true, name: true } });
  const countryMap = new Map(countries.map(c => [c.name, c.id]));

  let totalFixed = 0;

  for (const season of SEASONS) {
    if (badPlayerMap.size === 0) break;
    console.log(`\n📅 Season ${season} — ${badPlayerMap.size} players still need fixing`);
    console.log('─'.repeat(50));

    for (let i = 0; i < teamsWithBadPlayers.length; i++) {
      if (badPlayerMap.size === 0) break;
      const { teamApiId, teamName } = teamsWithBadPlayers[i];
      console.log(`[${season}][${i + 1}/${teamsWithBadPlayers.length}] ${teamName}`);

      try {
        const profiles = await apiGet<ApiPlayerResponse>('players', {
          team: teamApiId,
          season,
        });

        const fixed = await fixPlayers(profiles, badPlayerMap, countryMap);
        totalFixed += fixed;
        console.log(`  ✓ Fixed ${fixed} players (${badPlayerMap.size} remaining)`);
      } catch (err: any) {
        console.error(`  ✗ Error: ${err.message}`);
      }
    }
  }

  console.log('\n========================================');
  console.log(`✅ Fixed:     ${totalFixed} players`);
  console.log(`⚠️  Not found: ${badPlayerMap.size} players (no API data across all seasons)`);
  console.log('========================================\n');

  if (badPlayerMap.size > 0 && badPlayerMap.size <= 50) {
    console.log('Remaining unfixed apiFootballIds:');
    for (const [apiId] of badPlayerMap) process.stdout.write(`${apiId} `);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
