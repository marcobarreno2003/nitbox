// =============================================================================
// Seeder 02: National Teams + Venues
// Source: GET /teams?id={apiFootballId}
// Uses direct team IDs — more reliable than country name search
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';
import { TEAMS } from '../config';

interface ApiTeamResponse {
  team: {
    id: number;
    name: string;
    code: string | null;
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

  const countryMap = new Map<string, number>(); // iso3 -> db country id
  const countries = await prisma.country.findMany();
  countries.forEach(c => countryMap.set(c.isoAlpha3, c.id));

  for (const teamConfig of TEAMS) {
    // Skip OFC teams with no confirmed API ID
    if (teamConfig.apiFootballId === 0) {
      console.log(`  [SKIP] ${teamConfig.countryName} — API ID not confirmed`);
      continue;
    }

    // Skip if already in DB
    const existing = await prisma.nationalTeam.findUnique({ where: { apiFootballId: teamConfig.apiFootballId } });
    if (existing) {
      console.log(`  [SKIP] ${teamConfig.countryName} — already in DB`);
      continue;
    }

    const results = await apiGet<ApiTeamResponse>('teams', { id: teamConfig.apiFootballId });

    if (!results.length) {
      console.warn(`  [WARN] No data for team id ${teamConfig.apiFootballId} (${teamConfig.countryName})`);
      continue;
    }

    const { team, venue } = results[0];
    const countryId = countryMap.get(teamConfig.iso3);

    if (!countryId) {
      console.warn(`  [WARN] Country not in DB: ${teamConfig.countryName} (${teamConfig.iso3})`);
      continue;
    }

    // Upsert venue
    if (venue?.id) {
      await prisma.venue.upsert({
        where:  { apiFootballId: venue.id },
        update: {
          name:        venue.name,
          city:        venue.city,
          capacity:    venue.capacity,
          surfaceType: venue.surface,
          imageUrl:    venue.image,
          address:     venue.address,
        },
        create: {
          apiFootballId: venue.id,
          name:          venue.name,
          address:       venue.address,
          city:          venue.city,
          countryId,
          capacity:      venue.capacity,
          surfaceType:   venue.surface,
          imageUrl:      venue.image,
        },
      });
    }

    // Upsert national team
    await prisma.nationalTeam.upsert({
      where:  { apiFootballId: team.id },
      update: {
        name:     team.name,
        fifaCode: teamConfig.fifaCode,
        logoUrl:  team.logo,
        founded:  team.founded,
        national: team.national,
      },
      create: {
        apiFootballId: team.id,
        countryId,
        fifaCode:      teamConfig.fifaCode,
        name:          team.name,
        logoUrl:       team.logo,
        founded:       team.founded,
        national:      team.national,
      },
    });

    console.log(`  [OK] ${team.name} — API id: ${team.id}, code: ${teamConfig.fifaCode}`);
  }
}
