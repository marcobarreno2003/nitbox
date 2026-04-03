// =============================================================================
// Seeder 06: Standings + Team Season Stats
// Source: GET /standings?league={id}&season={year}
//         GET /teams/statistics?league={id}&season={year}&team={id}
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, apiGetOne } from '../api';
import { SEASONS } from '../config';

interface ApiStanding {
  rank: number;
  team: { id: number; name: string };
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null;
  status: string | null;
  description: string | null;
  all:  { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

interface ApiStandingsResponse {
  league: {
    id: number;
    season: number;
    standings: ApiStanding[][];
  };
}

interface ApiTeamStats {
  form: string | null;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins:   { home: number; away: number; total: number };
    draws:  { home: number; away: number; total: number };
    loses:  { home: number; away: number; total: number };
  };
  goals: {
    for:     { total: { home: number; away: number; total: number }; average: { total: string } };
    against: { total: { home: number; away: number; total: number }; average: { total: string } };
  };
  biggest: {
    streak: { wins: number; draws: number; loses: number };
    wins:   { home: string | null; away: string | null };
    loses:  { home: string | null; away: string | null };
  };
  clean_sheet:     { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
  penalty: {
    scored: { total: number };
    missed: { total: number };
    total:  number;
  };
}

export async function seedStandings(prisma: PrismaClient) {
  console.log('\nSeeding standings...');

  const teamMap  = new Map<number, number>(); // apiFootballId → db id
  const teams    = await prisma.nationalTeam.findMany();
  teams.forEach(t => teamMap.set(t.apiFootballId, t.id));

  const seasonMap = new Map<string, number>(); // `${compApiId}-${year}` → db season id
  const seasons   = await prisma.competitionSeason.findMany({ include: { competition: true } });
  seasons.forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const competitionSeasons = await prisma.competitionSeason.findMany({
    include: { competition: true },
    where: { apiFootballSeason: { in: SEASONS } },
  });

  for (const cs of competitionSeasons) {
    const leagueId = cs.competition.apiFootballId;
    const season   = cs.apiFootballSeason!;
    const seasonId = seasonMap.get(`${leagueId}-${season}`);
    if (!seasonId) continue;

    console.log(`\n  ${cs.competition.shortName} ${season}`);

    // Check if standings exist — skip API call but still run seedTeamSeasonStats
    const existingStandings = await prisma.standing.count({ where: { competitionSeasonId: seasonId } });
    const standingsAlreadySeeded = existingStandings > 0;

    if (!standingsAlreadySeeded) {
      console.log(`    Fetching standings...`);
    }

    // Fetch standings from API only if not yet seeded
    const apiResults = standingsAlreadySeeded
      ? null
      : await apiGet<ApiStandingsResponse>('standings', { league: leagueId, season });

    if (!standingsAlreadySeeded && (!apiResults || !apiResults.length)) continue;

    // Use API data or fall back to existing DB standings for teamSeasonStats
    const allGroups = apiResults ? apiResults[0].league.standings : null;

    // If standings need to be written from API data
    if (allGroups) {
      for (const group of allGroups) {
        for (const row of group) {
          const teamDbId = teamMap.get(row.team.id);
          if (!teamDbId) continue;

        // Prisma upsert does not support null in compound unique keys
        // so we use findFirst + create/update pattern
        // Some competitions (e.g. Asian Cup) don't return home/away breakdown — default to 0
        const standingData = {
          position:         row.rank,
          form:             row.form,
          status:           row.status,
          description:      row.description,
          points:           row.points,
          goalDifference:   row.goalsDiff,
          played:           row.all.played,
          won:              row.all.win,
          drawn:            row.all.draw,
          lost:             row.all.lose,
          goalsFor:         row.all.goals.for,
          goalsAgainst:     row.all.goals.against,
          homePlayed:       row.home?.played       ?? 0,
          homeWon:          row.home?.win          ?? 0,
          homeDrawn:        row.home?.draw         ?? 0,
          homeLost:         row.home?.lose         ?? 0,
          homeGoalsFor:     row.home?.goals?.for   ?? 0,
          homeGoalsAgainst: row.home?.goals?.against ?? 0,
          awayPlayed:       row.away?.played       ?? 0,
          awayWon:          row.away?.win          ?? 0,
          awayDrawn:        row.away?.draw         ?? 0,
          awayLost:         row.away?.lose         ?? 0,
          awayGoalsFor:     row.away?.goals?.for   ?? 0,
          awayGoalsAgainst: row.away?.goals?.against ?? 0,
        };

        const existing = await prisma.standing.findFirst({
          where: { competitionSeasonId: seasonId, groupId: null, teamId: teamDbId },
        });

        if (existing) {
          await prisma.standing.update({ where: { id: existing.id }, data: standingData });
        } else {
          await prisma.standing.create({
            data: {
              competitionSeason: { connect: { id: seasonId } },
              team:              { connect: { id: teamDbId } },
              ...standingData,
            },
          });
        }

          // Fetch team season stats
          await seedTeamSeasonStats(prisma, teamDbId, row.team.id, leagueId, season, seasonId);

          console.log(`    [OK] ${row.rank}. ${row.team.name} — ${row.points} pts`);
        }
      }
    }

    // If standings were already in DB, still run seedTeamSeasonStats using existing standings
    if (standingsAlreadySeeded) {
      console.log(`    [SKIP standings] Already seeded — running team season stats only`);
      const existingRows = await prisma.standing.findMany({
        where: { competitionSeasonId: seasonId },
        include: { team: { select: { id: true, apiFootballId: true } } },
      });
      for (const row of existingRows) {
        await seedTeamSeasonStats(prisma, row.teamId, row.team.apiFootballId, leagueId, season, seasonId);
      }
    }
  }
}

async function seedTeamSeasonStats(
  prisma: PrismaClient,
  teamDbId: number,
  teamApiId: number,
  leagueId: number,
  season: number,
  seasonId: number,
) {
  // Skip if team season stats already exist
  const existingStats = await prisma.teamSeasonStats.findUnique({
    where: { teamId_competitionSeasonId: { teamId: teamDbId, competitionSeasonId: seasonId } },
  });
  if (existingStats) return;

  const s = await apiGetOne<ApiTeamStats>('teams/statistics', {
    team:   teamApiId,
    league: leagueId,
    season,
  });

  if (!s || !s.fixtures) return;

  await prisma.teamSeasonStats.upsert({
    where: { teamId_competitionSeasonId: { teamId: teamDbId, competitionSeasonId: seasonId } },
    update: {},
    create: {
      teamId:             teamDbId,
      competitionSeasonId: seasonId,
      form:               s.form,
      matchesPlayed:      s.fixtures.played.total,
      wins:               s.fixtures.wins.total,
      draws:              s.fixtures.draws.total,
      losses:             s.fixtures.loses.total,
      homeMatchesPlayed:  s.fixtures.played.home,
      homeWins:           s.fixtures.wins.home,
      homeDraws:          s.fixtures.draws.home,
      homeLosses:         s.fixtures.loses.home,
      awayMatchesPlayed:  s.fixtures.played.away,
      awayWins:           s.fixtures.wins.away,
      awayDraws:          s.fixtures.draws.away,
      awayLosses:         s.fixtures.loses.away,
      goalsFor:           s.goals.for.total.total,
      goalsAgainst:       s.goals.against.total.total,
      goalsForHome:       s.goals.for.total.home,
      goalsForAway:       s.goals.for.total.away,
      goalsAgainstHome:   s.goals.against.total.home,
      goalsAgainstAway:   s.goals.against.total.away,
      goalsForAvg:        parseFloat(s.goals.for.average.total) || null,
      goalsAgainstAvg:    parseFloat(s.goals.against.average.total) || null,
      cleanSheets:        s.clean_sheet.total,
      cleanSheetsHome:    s.clean_sheet.home,
      cleanSheetsAway:    s.clean_sheet.away,
      failedToScore:      s.failed_to_score.total,
      biggestWinHome:     s.biggest.wins.home,
      biggestWinAway:     s.biggest.wins.away,
      biggestLossHome:    s.biggest.loses.home,
      biggestLossAway:    s.biggest.loses.away,
      winStreak:          s.biggest.streak.wins,
      drawStreak:         s.biggest.streak.draws,
      lossStreak:         s.biggest.streak.loses,
      penaltiesScored:    s.penalty.scored.total,
      penaltiesMissed:    s.penalty.missed.total,
      penaltiesTotal:     s.penalty.total,
    },
  });
}
