// =============================================================================
// Seeder 01: Reference Data
//   1. Confederations + Countries        (no API)
//   2. National Teams + Venues           (GET /teams?id={id})
//   3. Competitions + Seasons            (GET /leagues?id={id})
//   4. Players + Squads                  (GET /players/squads + /players)
//   5. Coaches + Assignments             (GET /coachs?team={id})
//
// All steps are idempotent — safe to re-run at any time.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';
import { CONFEDERATIONS, COMPETITIONS, SEASONS, TEAMS } from '../config';
import { parseCm, normalizePosition } from '../helpers/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiTeamResponse {
  team:  { id: number; name: string; code: string | null; country: string; founded: number | null; national: boolean; logo: string };
  venue: { id: number | null; name: string; address: string | null; city: string; capacity: number | null; surface: string | null; image: string | null };
}

interface ApiLeagueResponse {
  league:  { id: number; name: string; type: string; logo: string };
  country: { name: string; code: string | null; flag: string | null };
  seasons: { year: number; start: string; end: string; current: boolean }[];
}

interface ApiSquadResponse {
  team:    { id: number; name: string };
  players: { id: number; name: string; age: number; number: number | null; position: string; photo: string }[];
}

interface ApiPlayerResponse {
  player: {
    id: number; name: string; firstname: string; lastname: string; age: number;
    birth: { date: string; place: string | null; country: string | null };
    nationality: string; height: string | null; weight: string | null; injured: boolean; photo: string;
  };
  statistics: { team: { id: number } }[];
}

interface ApiCoachCareer {
  team:  { id: number; name: string };
  start: string | null;
  end:   string | null;
}

interface ApiCoachResponse {
  id: number; name: string; firstname: string; lastname: string; age: number | null;
  birth: { date: string | null; place: string | null; country: string | null };
  nationality: string | null; height: string | null; weight: string | null; photo: string | null;
  career: ApiCoachCareer[];
}

// ─── Step 1: Confederations + Countries ──────────────────────────────────────

async function seedStatic(prisma: PrismaClient) {
  console.log('\n[1/5] Confederations + Countries...');

  for (const conf of CONFEDERATIONS) {
    await prisma.confederation.upsert({
      where:  { code: conf.code },
      update: { name: conf.name },
      create: { code: conf.code, name: conf.name },
    });
  }
  console.log(`  [OK] ${CONFEDERATIONS.length} confederations`);

  const confMap = new Map<string, number>();
  (await prisma.confederation.findMany()).forEach(c => confMap.set(c.code, c.id));

  for (const team of TEAMS) {
    const confederationId = confMap.get(team.confederation)!;
    await prisma.country.upsert({
      where:  { isoAlpha3: team.iso3 },
      update: { name: team.countryName, isoAlpha2: team.iso2, confederationId },
      create: { name: team.countryName, isoAlpha2: team.iso2, isoAlpha3: team.iso3, confederationId },
    });
  }
  console.log(`  [OK] ${TEAMS.length} countries`);
}

// ─── Step 2: National Teams + Venues ─────────────────────────────────────────

async function seedTeams(prisma: PrismaClient) {
  console.log('\n[2/5] National Teams + Venues...');

  const countryMap = new Map<string, number>();
  (await prisma.country.findMany()).forEach(c => countryMap.set(c.isoAlpha3, c.id));

  let created = 0;
  let skipped = 0;

  for (const teamCfg of TEAMS) {
    if (teamCfg.apiFootballId === 0) { skipped++; continue; }

    const existing = await prisma.nationalTeam.findUnique({ where: { apiFootballId: teamCfg.apiFootballId } });
    if (existing) { skipped++; continue; }

    const results = await apiGet<ApiTeamResponse>('teams', { id: teamCfg.apiFootballId });
    if (!results.length) { console.warn(`  [WARN] No data for ${teamCfg.countryName}`); continue; }

    const { team, venue } = results[0];
    const countryId = countryMap.get(teamCfg.iso3);
    if (!countryId) { console.warn(`  [WARN] Country not in DB: ${teamCfg.iso3}`); continue; }

    if (venue?.id) {
      await prisma.venue.upsert({
        where:  { apiFootballId: venue.id },
        update: { name: venue.name, city: venue.city, capacity: venue.capacity, surfaceType: venue.surface, imageUrl: venue.image, address: venue.address },
        create: { apiFootballId: venue.id, name: venue.name, address: venue.address, city: venue.city, countryId, capacity: venue.capacity, surfaceType: venue.surface, imageUrl: venue.image },
      });
    }

    await prisma.nationalTeam.upsert({
      where:  { apiFootballId: team.id },
      update: { name: team.name, fifaCode: teamCfg.fifaCode, logoUrl: team.logo, founded: team.founded, national: team.national },
      create: { apiFootballId: team.id, countryId, fifaCode: teamCfg.fifaCode, name: team.name, logoUrl: team.logo, founded: team.founded, national: team.national },
    });

    created++;
    console.log(`  [OK] ${team.name}`);
  }

  console.log(`  ${created} created, ${skipped} skipped`);
}

// ─── Step 3: Competitions + Seasons ──────────────────────────────────────────

async function seedCompetitions(prisma: PrismaClient) {
  console.log('\n[3/5] Competitions + Seasons...');

  const confMap = new Map<string, number>();
  (await prisma.confederation.findMany()).forEach(c => confMap.set(c.code, c.id));

  for (const comp of COMPETITIONS) {
    const existing = await prisma.competition.findUnique({
      where:   { apiFootballId: comp.apiFootballId },
      include: { seasons: true },
    });

    if (existing) {
      const seededYears = existing.seasons.map(s => s.apiFootballSeason);
      if (SEASONS.every(y => seededYears.includes(y))) {
        console.log(`  [SKIP] ${comp.name}`);
        continue;
      }
    }

    const results = await apiGet<ApiLeagueResponse>('leagues', { id: comp.apiFootballId });
    if (!results.length) { console.warn(`  [WARN] No data for ${comp.name}`); continue; }

    const { league, country, seasons } = results[0];
    const confederationId = confMap.get(comp.confederation) ?? null;

    const competition = await prisma.competition.upsert({
      where:  { apiFootballId: league.id },
      update: { name: comp.name, shortName: comp.shortName, type: comp.type, logoUrl: league.logo, flagUrl: country.flag, confederationId },
      create: { apiFootballId: league.id, name: comp.name, shortName: comp.shortName, type: comp.type, logoUrl: league.logo, flagUrl: country.flag, confederationId },
    });

    const targetSeasons = seasons.filter(s => SEASONS.includes(s.year));
    for (const season of targetSeasons) {
      await prisma.competitionSeason.upsert({
        where:  { competitionId_label: { competitionId: competition.id, label: String(season.year) } },
        update: { apiFootballSeason: season.year, startDate: new Date(season.start), endDate: new Date(season.end), isCurrent: season.current },
        create: { competitionId: competition.id, apiFootballSeason: season.year, label: String(season.year), startDate: new Date(season.start), endDate: new Date(season.end), isCurrent: season.current },
      });
    }

    console.log(`  [OK] ${comp.name} (${targetSeasons.length} seasons)`);
  }
}

// ─── Step 4: Players + Squads ─────────────────────────────────────────────────

async function seedPlayers(prisma: PrismaClient) {
  console.log('\n[4/5] Players + Squads...');

  const LATEST_SEASON = new Date().getFullYear();

  const teams = await prisma.nationalTeam.findMany({ include: { country: true } });

  const countryMap = new Map<string, number>();
  (await prisma.country.findMany()).forEach(c => countryMap.set(c.name, c.id));

  for (const team of teams) {
    const existingSquad = await prisma.squad.findFirst({
      where: { teamId: team.id, competitionSeasonId: null },
    });
    if (existingSquad) {
      console.log(`  [SKIP] ${team.name}`);
      continue;
    }

    const squadResults = await apiGet<ApiSquadResponse>('players/squads', { team: team.apiFootballId });
    if (!squadResults.length) { console.warn(`  [WARN] No squad for ${team.name}`); continue; }

    const squadPlayers = squadResults[0].players;

    const playerProfiles = await apiGet<ApiPlayerResponse>('players', { team: team.apiFootballId, season: LATEST_SEASON });
    const profileMap = new Map<number, ApiPlayerResponse>();
    playerProfiles.forEach(p => profileMap.set(p.player.id, p));

    const squad = await prisma.squad.create({
      data: { teamId: team.id, competitionSeasonId: null, label: 'Current Squad' },
    });

    for (const sp of squadPlayers) {
      const profile = profileMap.get(sp.id);
      const p = profile?.player;

      const nameParts        = sp.name.split(' ');
      const firstName        = p?.firstname ?? nameParts[0];
      const lastName         = (p?.lastname ?? nameParts.slice(1).join(' ')) || '-';
      const nationalityId    = p ? (countryMap.get(p.nationality) ?? team.country.id) : team.country.id;
      const birthCountryId   = p?.birth?.country ? (countryMap.get(p.birth.country) ?? null) : null;

      const sharedFields = {
        firstName,
        lastName,
        commonName:     p?.name ?? sp.name,
        position:       normalizePosition(sp.position),
        photoUrl:       sp.photo,
        isInjured:      p?.injured ?? false,
        heightCm:       parseCm(p?.height ?? null),
        weightKg:       parseCm(p?.weight ?? null),
        ...(p?.birth?.date    && { dateOfBirth:    new Date(p.birth.date) }),
        ...(p?.birth?.place   && { birthPlace:     p.birth.place }),
        ...(birthCountryId    && { birthCountryId }),
        ...(nationalityId     && { nationalityId }),
      };

      const player = await prisma.player.upsert({
        where:  { apiFootballId: sp.id },
        update: sharedFields as any,
        create: { apiFootballId: sp.id, shirtNumber: sp.number, isActive: true, ...sharedFields } as any,
      });

      await prisma.squadPlayer.upsert({
        where:  { squadId_playerId: { squadId: squad.id, playerId: player.id } },
        update: { shirtNumber: sp.number },
        create: { squadId: squad.id, playerId: player.id, shirtNumber: sp.number },
      });
    }

    console.log(`  [OK] ${team.name} — ${squadPlayers.length} players`);
  }
}

// ─── Step 5: Coaches + Assignments ───────────────────────────────────────────

async function seedCoaches(prisma: PrismaClient) {
  console.log('\n[5/5] Coaches + Assignments...');

  const teams = await prisma.nationalTeam.findMany({ include: { country: true } });

  const countryMap = new Map<string, number>();
  (await prisma.country.findMany()).forEach(c => countryMap.set(c.name, c.id));

  const teamApiMap = new Map<number, number>();
  teams.forEach(t => teamApiMap.set(t.apiFootballId, t.id));

  for (const team of teams) {
    const existingAssignment = await prisma.coachAssignment.findFirst({ where: { teamId: team.id } });
    if (existingAssignment) {
      console.log(`  [SKIP] ${team.name}`);
      continue;
    }

    const results = await apiGet<ApiCoachResponse>('coachs', { team: team.apiFootballId });
    if (!results.length) { console.warn(`  [WARN] No coach data for ${team.name}`); continue; }

    for (const apiCoach of results) {
      const birthCountryId = apiCoach.birth.country ? (countryMap.get(apiCoach.birth.country) ?? null) : null;
      const nameParts  = (apiCoach.name ?? '').split(' ');
      const firstName  = apiCoach.firstname ?? (nameParts.slice(0, -1).join(' ') || apiCoach.name || 'Unknown');
      const lastName   = apiCoach.lastname  ?? (nameParts.slice(-1)[0] ?? '');

      const coachFields = {
        photoUrl:    apiCoach.photo,
        nationality: apiCoach.nationality,
        heightCm:    parseCm(apiCoach.height),
        weightKg:    parseCm(apiCoach.weight),
      };

      const coach = await prisma.coach.upsert({
        where:  { apiFootballId: apiCoach.id },
        update: coachFields,
        create: {
          apiFootballId: apiCoach.id,
          firstName,
          lastName,
          dateOfBirth:   apiCoach.birth.date ? new Date(apiCoach.birth.date) : null,
          birthPlace:    apiCoach.birth.place ?? null,
          birthCountryId,
          ...coachFields,
        },
      });

      for (const career of apiCoach.career) {
        const careerTeamDbId = teamApiMap.get(career.team.id);
        if (!careerTeamDbId) continue;

        const startDate = career.start ? new Date(career.start) : new Date('2000-01-01');
        const endDate   = career.end   ? new Date(career.end)   : null;

        const existingEntry = await prisma.coachAssignment.findFirst({
          where: { coachId: coach.id, teamId: careerTeamDbId, startDate },
        });
        if (existingEntry) continue;

        await prisma.coachAssignment.create({
          data: { coachId: coach.id, teamId: careerTeamDbId, role: 'head_coach', startDate, endDate },
        });
      }
    }

    console.log(`  [OK] ${team.name} — ${results.length} coach(es)`);
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function seedReference(prisma: PrismaClient) {
  await seedStatic(prisma);
  await seedTeams(prisma);
  await seedCompetitions(prisma);
  await seedPlayers(prisma);
  await seedCoaches(prisma);
}
