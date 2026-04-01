// =============================================================================
// Seeder 08: Coaches + Coach Assignments
// Source: GET /coachs?team={id}    (note: API-Football uses "coachs" not "coaches")
//
// Skip logic:
//   - Skip entire team if a CoachAssignment already exists for it
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet } from '../api';

interface ApiCoachCareer {
  team: { id: number; name: string };
  start: string | null;
  end:   string | null;
}

interface ApiCoachResponse {
  id:          number;
  name:        string;
  firstname:   string;
  lastname:    string;
  age:         number | null;
  birth: {
    date:    string | null;
    place:   string | null;
    country: string | null;
  };
  nationality: string | null;
  height:      string | null;
  weight:      string | null;
  photo:       string | null;
  career:      ApiCoachCareer[];
}

function parseCm(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^\d]/g, ''));
  return isNaN(n) ? null : n;
}

export async function seedCoaches(prisma: PrismaClient) {
  console.log('\nSeeding coaches...');

  const teams = await prisma.nationalTeam.findMany({ include: { country: true } });

  const countryMap = new Map<string, number>();
  const countries = await prisma.country.findMany();
  countries.forEach(c => countryMap.set(c.name, c.id));

  // Build teamApiId → dbId map for resolving career entries
  const teamApiMap = new Map<number, number>();
  teams.forEach(t => teamApiMap.set(t.apiFootballId, t.id));

  for (const team of teams) {
    console.log(`\n  ${team.name}`);

    // Skip if assignments already exist for this team
    const existingAssignment = await prisma.coachAssignment.findFirst({
      where: { teamId: team.id },
    });
    if (existingAssignment) {
      console.log(`    [SKIP] Already in DB`);
      continue;
    }

    const results = await apiGet<ApiCoachResponse>('coachs', { team: team.apiFootballId });

    if (!results.length) {
      console.warn(`    [WARN] No coach data found`);
      continue;
    }

    for (const apiCoach of results) {
      const birthCountryId = apiCoach.birth.country
        ? (countryMap.get(apiCoach.birth.country) ?? null)
        : null;

      // Upsert the coach profile
      const coach = await prisma.coach.upsert({
        where: { apiFootballId: apiCoach.id },
        update: {
          photoUrl:    apiCoach.photo,
          nationality: apiCoach.nationality,
          heightCm:    parseCm(apiCoach.height),
          weightKg:    parseCm(apiCoach.weight),
        },
        create: {
          apiFootballId:  apiCoach.id,
          firstName:      apiCoach.firstname,
          lastName:       apiCoach.lastname,
          dateOfBirth:    apiCoach.birth.date ? new Date(apiCoach.birth.date) : null,
          birthPlace:     apiCoach.birth.place ?? null,
          birthCountryId,
          nationality:    apiCoach.nationality,
          heightCm:       parseCm(apiCoach.height),
          weightKg:       parseCm(apiCoach.weight),
          photoUrl:       apiCoach.photo,
        },
      });

      // Create assignments for all career entries that involve our teams
      for (const career of apiCoach.career) {
        const careerTeamDbId = teamApiMap.get(career.team.id);
        if (!careerTeamDbId) continue; // only track our 60 teams

        const startDate = career.start ? new Date(career.start) : new Date('2000-01-01');
        const endDate   = career.end   ? new Date(career.end)   : null;

        // Avoid duplicate assignments (same coach + team + start date)
        const existingEntry = await prisma.coachAssignment.findFirst({
          where: { coachId: coach.id, teamId: careerTeamDbId, startDate },
        });
        if (existingEntry) continue;

        await prisma.coachAssignment.create({
          data: {
            coachId:   coach.id,
            teamId:    careerTeamDbId,
            role:      'head_coach',
            startDate,
            endDate,
          },
        });
      }
    }

    console.log(`    [OK] ${results.length} coach(es) processed`);
  }
}
