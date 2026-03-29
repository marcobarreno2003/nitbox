// =============================================================================
// Seeder 05: Players + Squads
// Source: GET /players/squads?team={id}
//         GET /players?team={id}&season={year}
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';

interface ApiSquadResponse {
  team: { id: number; name: string };
  players: {
    id: number;
    name: string;
    age: number;
    number: number | null;
    position: string;
    photo: string;
  }[];
}

interface ApiPlayerResponse {
  player: {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    age: number;
    birth: { date: string; place: string | null; country: string | null };
    nationality: string;
    height: string | null;
    weight: string | null;
    injured: boolean;
    photo: string;
  };
  statistics: {
    team: { id: number };
    games: {
      appearences: number | null;
      lineups: number | null;
      minutes: number | null;
      rating: string | null;
    };
    goals: { total: number | null; assists: number | null };
    shots: { total: number | null; on: number | null };
    passes: { total: number | null; key: number | null; accuracy: number | null };
    tackles: { total: number | null; interceptions: number | null };
    dribbles: { attempts: number | null; success: number | null };
    fouls: { drawn: number | null; committed: number | null };
    cards: { yellow: number; red: number };
    penalty: { scored: number | null; missed: number | null };
  }[];
}

function parseCm(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^\d]/g, ''));
  return isNaN(n) ? null : n;
}

export async function seedPlayers(prisma: PrismaClient) {
  console.log('\nSeeding players and squads...');

  const teams = await prisma.nationalTeam.findMany({
    include: { country: true },
  });

  const countryMap = new Map<string, number>(); // country name → db id
  const countries = await prisma.country.findMany();
  countries.forEach(c => countryMap.set(c.name, c.id));

  for (const team of teams) {
    console.log(`\n  🔍 ${team.name}`);

    // Get current squad roster
    const squadResults = await apiGet<ApiSquadResponse>('players/squads', { team: team.apiFootballId });

    if (!squadResults.length) {
      console.warn(`    [WARN] No squad found`);
      continue;
    }

    const squadPlayers = squadResults[0].players;

    // Fetch full player profiles for this team (latest season)
    const playerProfiles = await apiGet<ApiPlayerResponse>('players', {
      team: team.apiFootballId,
      season: 2024,
    });

    const profileMap = new Map<number, ApiPlayerResponse>();
    playerProfiles.forEach(p => profileMap.set(p.player.id, p));

    // Upsert each player
    for (const sp of squadPlayers) {
      const profile = profileMap.get(sp.id);
      const p = profile?.player;

      const nationalityId = p
        ? (countryMap.get(p.nationality) ?? team.country.id)
        : team.country.id;

      const birthCountryId = p?.birth?.country
        ? (countryMap.get(p.birth.country) ?? null)
        : null;

      await prisma.player.upsert({
        where: { apiFootballId: sp.id },
        update: {
          commonName:    p?.name ?? sp.name,
          position:      normalizePosition(sp.position),
          photoUrl:      sp.photo,
          isInjured:     p?.injured ?? false,
          heightCm:      parseCm(p?.height ?? null),
          weightKg:      parseCm(p?.weight ?? null),
        },
        create: {
          apiFootballId: sp.id, 
          firstName:     p?.firstname ?? sp.name.split(' ')[0],
          lastName:      (p?.lastname ?? sp.name.split(' ').slice(1).join(' ')) || '-',
          commonName:    p?.name ?? sp.name,
          dateOfBirth:   p?.birth?.date ? new Date(p.birth.date) : new Date('1990-01-01'),
          birthPlace:    p?.birth?.place ?? null,
          birthCountryId,
          nationalityId,
          position:      normalizePosition(sp.position),
          shirtNumber:   sp.number,
          photoUrl:      sp.photo,
          isActive:      true,
          isInjured:     p?.injured ?? false,
          heightCm:      parseCm(p?.height ?? null),
          weightKg:      parseCm(p?.weight ?? null),
        },
      });
    }

    console.log(`    [OK] ${squadPlayers.length} players upserted`);
  }
}

function normalizePosition(pos: string): string {
  const map: Record<string, string> = {
    'Goalkeeper':  'GK',
    'Defender':    'CB',
    'Midfielder':  'CM',
    'Attacker':    'ST',
  };
  return map[pos] ?? pos;
}
