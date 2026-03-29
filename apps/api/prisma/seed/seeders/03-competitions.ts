// =============================================================================
// Seeder 03: Competitions + Seasons
// Source: GET /leagues?id={id}
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';
import { COMPETITIONS, SEASONS } from '../config';

interface ApiLeagueResponse {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string;
  };
  country: {
    name: string;
    code: string | null;
    flag: string | null;
  };
  seasons: {
    year: number;
    start: string;
    end: string;
    current: boolean;
  }[];
}

export async function seedCompetitions(prisma: PrismaClient) {
  console.log('\nSeeding competitions and seasons...');

  const confMap = new Map<string, number>();
  const confs = await prisma.confederation.findMany();
  confs.forEach(c => confMap.set(c.code, c.id));

  for (const comp of COMPETITIONS) {
    const results = await apiGet<ApiLeagueResponse>('leagues', { id: comp.apiFootballId });

    if (!results.length) {
      console.warn(`  [WARN] No data for competition id: ${comp.apiFootballId}`);
      continue;
    }

    const { league, country, seasons } = results[0];
    const confederationId = confMap.get(comp.confederation) ?? null;

    // Upsert competition
    const competition = await prisma.competition.upsert({
      where: { apiFootballId: league.id },
      update: {
        name: comp.name,
        shortName: comp.shortName,
        type: comp.type,
        logoUrl: league.logo,
        flagUrl: country.flag,
        confederationId,
      },
      create: {
        apiFootballId: league.id,
        name: comp.name,
        shortName: comp.shortName,
        type: comp.type,
        logoUrl: league.logo,
        flagUrl: country.flag,
        confederationId,
      },
    });

    console.log(`  [OK] ${comp.name}`);

    // Upsert only the seasons we care about
    const targetSeasons = seasons.filter(s => SEASONS.includes(s.year));

    for (const season of targetSeasons) {
      await prisma.competitionSeason.upsert({
        where: { competitionId_label: { competitionId: competition.id, label: String(season.year) } },
        update: {
          apiFootballSeason: season.year,
          startDate: new Date(season.start),
          endDate: new Date(season.end),
          isCurrent: season.current,
        },
        create: {
          competitionId: competition.id,
          apiFootballSeason: season.year,
          label: String(season.year),
          startDate: new Date(season.start),
          endDate: new Date(season.end),
          isCurrent: season.current,
        },
      });
      console.log(`    [OK] Season ${season.year}`);
    }
  }
}
