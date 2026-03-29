// =============================================================================
// Seeder 02: National Teams + Venues
// Source: GET /teams?national=true&country={name}
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';
import { TARGET_TEAM_NAMES } from '../config';

interface ApiTeamResponse {
  team: {
    id: number;
    name: string;
    code: string;
    country: string;
    founded: number | null;
    national: boolean;
    logo: string;
  };
  venue: {
    id: number | null;
    name: string;
    address: string | null;
    city: string;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  };
}

export async function seedTeams(prisma: PrismaClient) {
  console.log('\nSeeding national teams and venues...');

  const countryMap = new Map<string, { id: number; isoAlpha3: string }>();
  const countries = await prisma.country.findMany();
  countries.forEach(c => countryMap.set(c.name, { id: c.id, isoAlpha3: c.isoAlpha3 }));

  for (const countryName of TARGET_TEAM_NAMES) {
    const results = await apiGet<ApiTeamResponse>('teams', {
      national: 'true',
      country: countryName,
    });

    if (!results.length) {
      console.warn(`  [WARN] No team found for: ${countryName}`);
      continue;
    }

    // Pick the national team entry (national: true)
    const entry = results.find(r => r.team.national) ?? results[0];
    const { team, venue } = entry;

    const country = countryMap.get(countryName);
    if (!country) {
      console.warn(`  [WARN] Country not in DB: ${countryName}`);
      continue;
    }

    // Upsert venue if it has an ID
    let venueId: number | null = null;
    if (venue?.id) {
      const v = await prisma.venue.upsert({
        where: { apiFootballId: venue.id },
        update: {
          name: venue.name,
          city: venue.city,
          capacity: venue.capacity,
          surfaceType: venue.surface,
          imageUrl: venue.image,
          address: venue.address,
        },
        create: {
          apiFootballId: venue.id,
          name: venue.name,
          address: venue.address,
          city: venue.city,
          countryId: country.id,
          capacity: venue.capacity,
          surfaceType: venue.surface,
          imageUrl: venue.image,
        },
      });
      venueId = v.id;
    }

    // Upsert national team
    await prisma.nationalTeam.upsert({
      where: { apiFootballId: team.id },
      update: {
        name: team.name,
        fifaCode: team.code ?? country.isoAlpha3,
        logoUrl: team.logo,
        founded: team.founded,
        national: team.national,
      },
      create: {
        apiFootballId: team.id,
        countryId: country.id,
        fifaCode: team.code ?? country.isoAlpha3,
        name: team.name,
        logoUrl: team.logo,
        founded: team.founded,
        national: team.national,
      },
    });

    console.log(`  [OK] ${team.name} (id: ${team.id})`);
    _ = venueId; // reserved for future fixture linking
  }
}

// silence unused warning
let _: unknown;
