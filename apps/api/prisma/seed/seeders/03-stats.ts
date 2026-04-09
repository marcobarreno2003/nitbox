// =============================================================================
// Seeder 03: Statistics
//   1. Standings + Team Season Stats     (GET /standings + /teams/statistics)
//   2. Player Season Stats               (computed from player_match_stats — no API)
//
// Both steps are idempotent.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, apiGetOne } from '../api';
import { SEASONS } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiStanding {
  rank:        number;
  team:        { id: number; name: string };
  points:      number;
  goalsDiff:   number;
  group:       string;
  form:        string | null;
  status:      string | null;
  description: string | null;
  all:  { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

interface ApiStandingsResponse {
  league: { id: number; season: number; standings: ApiStanding[][] };
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
  penalty: { scored: { total: number }; missed: { total: number }; total: number };
}

// ─── Step 1: Standings + Team Season Stats ────────────────────────────────────

async function seedStandings(prisma: PrismaClient) {
  console.log('\n[1/2] Standings + Team Season Stats...');

  const teamMap = new Map<number, number>();
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  const seasonMap = new Map<string, number>();
  (await prisma.competitionSeason.findMany({ include: { competition: true } }))
    .forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const competitionSeasons = await prisma.competitionSeason.findMany({
    include: { competition: true },
    where:   { apiFootballSeason: { in: SEASONS } },
  });

  for (const cs of competitionSeasons) {
    const leagueId = cs.competition.apiFootballId;
    const season   = cs.apiFootballSeason!;
    const seasonId = seasonMap.get(`${leagueId}-${season}`);
    if (!seasonId) continue;

    console.log(`\n  ${cs.competition.shortName} ${season}`);

    const existingCount = await prisma.standing.count({ where: { competitionSeasonId: seasonId } });
    const alreadySeeded = existingCount > 0;

    let allGroups: ApiStanding[][] | null = null;

    if (!alreadySeeded) {
      const apiResults = await apiGet<ApiStandingsResponse>('standings', { league: leagueId, season });
      if (!apiResults.length) continue;
      allGroups = apiResults[0].league.standings;
    }

    if (allGroups) {
      for (const group of allGroups) {
        for (const row of group) {
          const teamDbId = teamMap.get(row.team.id);
          if (!teamDbId) continue;

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

          // Prisma upsert doesn't support null in compound unique keys — use findFirst pattern
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

          await seedTeamSeasonStats(prisma, teamDbId, row.team.id, leagueId, season, seasonId);
          console.log(`    [OK] ${row.rank}. ${row.team.name} — ${row.points} pts`);
        }
      }
    } else {
      // standings already in DB — still run team season stats
      console.log('    [SKIP standings] — running team season stats only');
      const existingRows = await prisma.standing.findMany({
        where:   { competitionSeasonId: seasonId },
        include: { team: { select: { id: true, apiFootballId: true } } },
      });
      for (const row of existingRows) {
        await seedTeamSeasonStats(prisma, row.teamId, row.team.apiFootballId, leagueId, season, seasonId);
      }
    }
  }
}

async function seedTeamSeasonStats(
  prisma:    PrismaClient,
  teamDbId:  number,
  teamApiId: number,
  leagueId:  number,
  season:    number,
  seasonId:  number,
) {
  const existing = await prisma.teamSeasonStats.findUnique({
    where: { teamId_competitionSeasonId: { teamId: teamDbId, competitionSeasonId: seasonId } },
  });
  if (existing) return;

  const s = await apiGetOne<ApiTeamStats>('teams/statistics', { team: teamApiId, league: leagueId, season });
  if (!s?.fixtures) return;

  await prisma.teamSeasonStats.create({
    data: {
      teamId:              teamDbId,
      competitionSeasonId: seasonId,
      form:                s.form,
      matchesPlayed:       s.fixtures.played.total,
      wins:                s.fixtures.wins.total,
      draws:               s.fixtures.draws.total,
      losses:              s.fixtures.loses.total,
      homeMatchesPlayed:   s.fixtures.played.home,
      homeWins:            s.fixtures.wins.home,
      homeDraws:           s.fixtures.draws.home,
      homeLosses:          s.fixtures.loses.home,
      awayMatchesPlayed:   s.fixtures.played.away,
      awayWins:            s.fixtures.wins.away,
      awayDraws:           s.fixtures.draws.away,
      awayLosses:          s.fixtures.loses.away,
      goalsFor:            s.goals.for.total.total,
      goalsAgainst:        s.goals.against.total.total,
      goalsForHome:        s.goals.for.total.home,
      goalsForAway:        s.goals.for.total.away,
      goalsAgainstHome:    s.goals.against.total.home,
      goalsAgainstAway:    s.goals.against.total.away,
      goalsForAvg:         parseFloat(s.goals.for.average.total) || null,
      goalsAgainstAvg:     parseFloat(s.goals.against.average.total) || null,
      cleanSheets:         s.clean_sheet.total,
      cleanSheetsHome:     s.clean_sheet.home,
      cleanSheetsAway:     s.clean_sheet.away,
      failedToScore:       s.failed_to_score.total,
      biggestWinHome:      s.biggest.wins.home,
      biggestWinAway:      s.biggest.wins.away,
      biggestLossHome:     s.biggest.loses.home,
      biggestLossAway:     s.biggest.loses.away,
      winStreak:           s.biggest.streak.wins,
      drawStreak:          s.biggest.streak.draws,
      lossStreak:          s.biggest.streak.loses,
      penaltiesScored:     s.penalty.scored.total,
      penaltiesMissed:     s.penalty.missed.total,
      penaltiesTotal:      s.penalty.total,
    },
  });
}

// ─── Step 2: Player Season Stats (computed — no API) ──────────────────────────

async function seedPlayerSeasonStats(prisma: PrismaClient) {
  console.log('\n[2/2] Player Season Stats (computed from match data)...');

  const allStats = await prisma.playerMatchStats.findMany({
    include: { match: { select: { competitionSeasonId: true } } },
  });

  if (!allStats.length) {
    console.log('  [SKIP] No player match stats found — run seeder 02 first');
    return;
  }

  // Group by (playerId, competitionSeasonId, teamId)
  const groups = new Map<string, typeof allStats>();
  for (const s of allStats) {
    const key = `${s.playerId}-${s.match.competitionSeasonId}-${s.teamId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  let created = 0;
  let skipped = 0;

  for (const [key, rows] of groups) {
    const [playerIdStr, csIdStr, teamIdStr] = key.split('-');
    const playerId            = parseInt(playerIdStr);
    const competitionSeasonId = parseInt(csIdStr);
    const teamId              = parseInt(teamIdStr);

    const existing = await prisma.playerSeasonStats.findUnique({
      where: { playerId_competitionSeasonId_teamId: { playerId, competitionSeasonId, teamId } },
    });
    if (existing) { skipped++; continue; }

    const appearances    = rows.filter(r => (r.minutesPlayed ?? 0) > 0).length;
    const starts         = rows.filter(r => !r.substitute).length;
    const minutesPlayed  = rows.reduce((sum, r) => sum + (r.minutesPlayed ?? 0), 0);
    const goals          = rows.reduce((sum, r) => sum + (r.goals ?? 0), 0);
    const assists        = rows.reduce((sum, r) => sum + (r.assists ?? 0), 0);
    const yellowCards    = rows.reduce((sum, r) => sum + (r.yellowCards ?? 0), 0);
    const redCards       = rows.reduce((sum, r) => sum + (r.redCards ?? 0), 0);

    const shots              = nullSum(rows.map(r => r.shots));
    const shotsOnTarget      = nullSum(rows.map(r => r.shotsOnTarget));
    const passes             = nullSum(rows.map(r => r.passes));
    const passesCompleted    = nullSum(rows.map(r => r.passesCompleted));
    const keyPasses          = nullSum(rows.map(r => r.keyPasses));
    const dribbles           = nullSum(rows.map(r => r.dribbles));
    const dribblesCompleted  = nullSum(rows.map(r => r.dribblesCompleted));
    const tackles            = nullSum(rows.map(r => r.tackles));
    const interceptions      = nullSum(rows.map(r => r.interceptions));
    const clearances         = nullSum(rows.map(r => r.clearances));
    const foulsCommitted     = nullSum(rows.map(r => r.foulsCommitted));
    const foulsSuffered      = nullSum(rows.map(r => r.foulsSuffered));
    const saves              = nullSum(rows.map(r => r.saves));
    const penaltyScored      = nullSum(rows.map(r => r.penaltyScored));
    const penaltyMissed      = nullSum(rows.map(r => r.penaltyMissed));

    const ratedRows      = rows.filter(r => r.rating !== null);
    const averageRating  = ratedRows.length
      ? ratedRows.reduce((sum, r) => sum + r.rating!, 0) / ratedRows.length
      : null;

    await prisma.playerSeasonStats.create({
      data: {
        playerId, competitionSeasonId, teamId,
        appearances, starts, minutesPlayed, goals, assists,
        shots, shotsOnTarget, passes, passesCompleted, keyPasses,
        dribbles, dribblesCompleted, tackles, interceptions, clearances,
        foulsCommitted, foulsSuffered, saves, yellowCards, redCards,
        penaltyScored, penaltyMissed,
        averageRating: averageRating ? parseFloat(averageRating.toFixed(2)) : null,
      },
    });

    created++;
  }

  console.log(`  [OK] ${created} records created, ${skipped} skipped`);
}

function nullSum(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && v !== undefined);
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function seedStats(prisma: PrismaClient) {
  await seedStandings(prisma);
  await seedPlayerSeasonStats(prisma);
}
