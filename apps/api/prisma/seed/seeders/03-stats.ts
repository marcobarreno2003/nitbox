// =============================================================================
// Seeder 03: Statistics
//   1. Standings + Competition Groups + Team Season Stats
//   2. Player Season Stats (computed from player_match_stats — no API)
//   3. Trophies (GET /trophies?team={id})
//   4. Player Injuries (GET /injuries?team={id}&season={year})
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { apiGet, apiGetOne } from '../api';
import { SEASONS, TEAMS } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiStanding {
  rank:        number;
  team:        { id: number; name: string };
  points:      number;
  goalsDiff:   number;
  group:       string | null;
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

interface ApiTrophy {
  league:  string | null;
  country: string | null;
  season:  string | null;
  place:   string | null;  // "Winner", "2nd Place", "3rd Place"
}

interface ApiInjury {
  player: { id: number; name: string; type: string; reason: string };
  team:   { id: number };
}

// ─── Step 1: Standings + Competition Groups + Team Season Stats ───────────────

async function seedStandings(prisma: PrismaClient) {
  console.log('\n[1/4] Standings + Competition Groups + Team Season Stats...');

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
    const season   = cs.apiFootballSeason;
    const seasonId = seasonMap.get(`${leagueId}-${season}`);
    if (!seasonId) continue;

    console.log(`\n  ${cs.competition.shortName} ${season}`);

    // Check if standings already exist for this season
    const existingCount = await prisma.standing.count({ where: { competitionSeasonId: seasonId } });

    let allGroups: ApiStanding[][] | null = null;

    if (existingCount === 0) {
      const apiResults = await apiGet<ApiStandingsResponse>('standings', { league: leagueId, season });
      if (!apiResults.length) { console.log('    [SKIP] No standings data'); continue; }
      allGroups = apiResults[0].league.standings;
    } else {
      console.log(`    [SKIP standings] already seeded — running team stats only`);
    }

    if (allGroups) {
      // Collect all unique group names to create CompetitionGroup rows
      const groupNames = [...new Set(allGroups.map(g => g[0]?.group).filter(Boolean) as string[])];

      // Upsert CompetitionGroup rows
      const groupIdMap = new Map<string, number>();
      for (const groupName of groupNames) {
        const stage = groupName.toLowerCase().includes('group') ? 'group' : 'knockout';
        const group = await prisma.competitionGroup.upsert({
          where:  { competitionSeasonId_name: { competitionSeasonId: seasonId, name: groupName } },
          update: { stage },
          create: { competitionSeasonId: seasonId, name: groupName, stage },
        });
        groupIdMap.set(groupName, group.id);
      }

      for (const group of allGroups) {
        for (const row of group) {
          const teamDbId = teamMap.get(row.team.id);
          if (!teamDbId) continue;

          const groupId = row.group ? (groupIdMap.get(row.group) ?? null) : null;

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
            homePlayed:       row.home?.played        ?? 0,
            homeWon:          row.home?.win            ?? 0,
            homeDrawn:        row.home?.draw           ?? 0,
            homeLost:         row.home?.lose           ?? 0,
            homeGoalsFor:     row.home?.goals?.for     ?? 0,
            homeGoalsAgainst: row.home?.goals?.against ?? 0,
            awayPlayed:       row.away?.played         ?? 0,
            awayWon:          row.away?.win            ?? 0,
            awayDrawn:        row.away?.draw           ?? 0,
            awayLost:         row.away?.lose           ?? 0,
            awayGoalsFor:     row.away?.goals?.for     ?? 0,
            awayGoalsAgainst: row.away?.goals?.against ?? 0,
          };

          const existing = await prisma.standing.findFirst({
            where: { competitionSeasonId: seasonId, groupId: groupId ?? null, teamId: teamDbId },
          });

          if (existing) {
            await prisma.standing.update({ where: { id: existing.id }, data: standingData });
          } else {
            await prisma.standing.create({
              data: {
                competitionSeasonId: seasonId,
                teamId: teamDbId,
                ...(groupId ? { groupId } : {}),
                ...standingData,
              },
            });
          }

          await seedTeamSeasonStats(prisma, teamDbId, row.team.id, leagueId, season, seasonId);
          console.log(`    [OK] ${row.rank}. ${row.team.name} (${row.group ?? 'no group'}) — ${row.points} pts`);
        }
      }
    } else {
      // Standings already seeded — still refresh team season stats
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
  // Always refresh — team stats change during active seasons
  const s = await apiGetOne<ApiTeamStats>('teams/statistics', { team: teamApiId, league: leagueId, season });
  if (!s?.fixtures) return;

  const data = {
    form:              s.form,
    matchesPlayed:     s.fixtures.played.total,
    wins:              s.fixtures.wins.total,
    draws:             s.fixtures.draws.total,
    losses:            s.fixtures.loses.total,
    homeMatchesPlayed: s.fixtures.played.home,
    homeWins:          s.fixtures.wins.home,
    homeDraws:         s.fixtures.draws.home,
    homeLosses:        s.fixtures.loses.home,
    awayMatchesPlayed: s.fixtures.played.away,
    awayWins:          s.fixtures.wins.away,
    awayDraws:         s.fixtures.draws.away,
    awayLosses:        s.fixtures.loses.away,
    goalsFor:          s.goals.for.total.total,
    goalsAgainst:      s.goals.against.total.total,
    goalsForHome:      s.goals.for.total.home,
    goalsForAway:      s.goals.for.total.away,
    goalsAgainstHome:  s.goals.against.total.home,
    goalsAgainstAway:  s.goals.against.total.away,
    goalsForAvg:       parseFloat(s.goals.for.average.total)     || null,
    goalsAgainstAvg:   parseFloat(s.goals.against.average.total) || null,
    cleanSheets:       s.clean_sheet.total,
    cleanSheetsHome:   s.clean_sheet.home,
    cleanSheetsAway:   s.clean_sheet.away,
    failedToScore:     s.failed_to_score.total,
    biggestWinHome:    s.biggest.wins.home,
    biggestWinAway:    s.biggest.wins.away,
    biggestLossHome:   s.biggest.loses.home,
    biggestLossAway:   s.biggest.loses.away,
    winStreak:         s.biggest.streak.wins,
    drawStreak:        s.biggest.streak.draws,
    lossStreak:        s.biggest.streak.loses,
    penaltiesScored:   s.penalty.scored.total,
    penaltiesMissed:   s.penalty.missed.total,
    penaltiesTotal:    s.penalty.total,
  };

  await prisma.teamSeasonStats.upsert({
    where:  { teamId_competitionSeasonId: { teamId: teamDbId, competitionSeasonId: seasonId } },
    create: { teamId: teamDbId, competitionSeasonId: seasonId, ...data },
    update: data,
  });
}

// ─── Step 2: Player Season Stats (computed — refreshes on every run) ──────────

async function seedPlayerSeasonStats(prisma: PrismaClient) {
  console.log('\n[2/4] Player Season Stats (computed from match data)...');

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

  let upserted = 0;

  for (const [key, rows] of groups) {
    const [playerIdStr, csIdStr, teamIdStr] = key.split('-');
    const playerId            = parseInt(playerIdStr);
    const competitionSeasonId = parseInt(csIdStr);
    const teamId              = parseInt(teamIdStr);

    const appearances   = rows.filter(r => (r.minutesPlayed ?? 0) > 0).length;
    const starts        = rows.filter(r => !r.substitute).length;
    const minutesPlayed = rows.reduce((sum, r) => sum + (r.minutesPlayed ?? 0), 0);
    const goals         = rows.reduce((sum, r) => sum + (r.goals ?? 0), 0);
    const assists       = rows.reduce((sum, r) => sum + (r.assists ?? 0), 0);
    const yellowCards   = rows.reduce((sum, r) => sum + (r.yellowCards ?? 0), 0);
    const redCards      = rows.reduce((sum, r) => sum + (r.redCards ?? 0), 0);

    const ratedRows   = rows.filter(r => r.rating !== null);
    const avgRating   = ratedRows.length
      ? ratedRows.reduce((sum, r) => sum + r.rating!, 0) / ratedRows.length
      : null;

    const data = {
      appearances,
      starts,
      minutesPlayed,
      goals,
      assists,
      xG:               nullSum(rows.map(r => r.xG)),
      xA:               nullSum(rows.map(r => r.xA)),
      shots:            nullSum(rows.map(r => r.shots)),
      shotsOnTarget:    nullSum(rows.map(r => r.shotsOnTarget)),
      passes:           nullSum(rows.map(r => r.passes)),
      passesCompleted:  nullSum(rows.map(r => r.passesCompleted)),
      keyPasses:        nullSum(rows.map(r => r.keyPasses)),
      dribbles:         nullSum(rows.map(r => r.dribbles)),
      dribblesCompleted: nullSum(rows.map(r => r.dribblesCompleted)),
      tackles:          nullSum(rows.map(r => r.tackles)),
      interceptions:    nullSum(rows.map(r => r.interceptions)),
      clearances:       nullSum(rows.map(r => r.clearances)),
      foulsCommitted:   nullSum(rows.map(r => r.foulsCommitted)),
      foulsSuffered:    nullSum(rows.map(r => r.foulsSuffered)),
      saves:            nullSum(rows.map(r => r.saves)),
      yellowCards,
      redCards,
      penaltyScored:    nullSum(rows.map(r => r.penaltyScored)),
      penaltyMissed:    nullSum(rows.map(r => r.penaltyMissed)),
      averageRating:    avgRating ? parseFloat(avgRating.toFixed(2)) : null,
    };

    await prisma.playerSeasonStats.upsert({
      where:  { playerId_competitionSeasonId_teamId: { playerId, competitionSeasonId, teamId } },
      create: { playerId, competitionSeasonId, teamId, ...data },
      update: data,
    });

    upserted++;
  }

  console.log(`  [OK] ${upserted} player-season records upserted`);
}

function nullSum(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && v !== undefined);
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}

// ─── Step 3: Trophies (GET /trophies?team={id}) ───────────────────────────────

async function seedTrophies(prisma: PrismaClient) {
  console.log('\n[3/4] Trophies...');

  const teamMap = new Map<number, number>();
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  // competitionMap: league name → CompetitionSeason id (match by competition name + season year)
  const competitionSeasons = await prisma.competitionSeason.findMany({
    include: { competition: true },
  });

  // Map: `${compName.toLowerCase()}-${year}` → competitionSeasonId
  const csLookup = new Map<string, number>();
  for (const cs of competitionSeasons) {
    const key = `${cs.competition.name.toLowerCase()}-${cs.apiFootballSeason}`;
    csLookup.set(key, cs.id);
  }

  let created = 0;

  for (const teamCfg of TEAMS) {
    if (teamCfg.apiFootballId === 0) continue;

    const teamDbId = teamMap.get(teamCfg.apiFootballId);
    if (!teamDbId) continue;

    const trophies = await apiGet<ApiTrophy>('trophies', { team: teamCfg.apiFootballId });

    for (const trophy of trophies) {
      if (!trophy.place || !trophy.league || !trophy.season) continue;

      const place = trophy.place.trim().toLowerCase();
      const type  = place === 'winner' ? 'champion'
        : place.includes('2nd') ? 'runner_up'
        : place.includes('3rd') ? 'third_place'
        : null;
      if (!type) continue;

      // Parse season year (API returns "2022" or "2022/2023")
      const yearMatch = trophy.season.match(/\d{4}/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[0]);

      const csKey = `${trophy.league.toLowerCase()}-${year}`;
      const competitionSeasonId = csLookup.get(csKey);
      if (!competitionSeasonId) continue;

      await prisma.trophy.upsert({
        where:  { teamId_type_competitionSeasonId: { teamId: teamDbId, type, competitionSeasonId } },
        update: { placement: type === 'champion' ? 1 : type === 'runner_up' ? 2 : 3 },
        create: {
          teamId: teamDbId,
          competitionSeasonId,
          type,
          placement: type === 'champion' ? 1 : type === 'runner_up' ? 2 : 3,
        },
      });
      created++;
    }

    if (trophies.length > 0) {
      console.log(`  [OK] ${teamCfg.fifaCode ?? teamCfg.countryName} — ${trophies.length} trophies fetched`);
    }
  }

  console.log(`  ${created} trophy records upserted`);
}

// ─── Step 4: Player Injuries (GET /injuries?team={id}&season={year}) ──────────

async function seedInjuries(prisma: PrismaClient) {
  console.log('\n[4/4] Player Injuries...');

  const teamMap = new Map<number, number>();
  (await prisma.nationalTeam.findMany()).forEach(t => teamMap.set(t.apiFootballId, t.id));

  const playerMap = new Map<number, number>();
  (await prisma.player.findMany({ select: { id: true, apiFootballId: true } }))
    .forEach(p => playerMap.set(p.apiFootballId, p.id));

  const seasonMap = new Map<string, number>();
  (await prisma.competitionSeason.findMany({ include: { competition: true } }))
    .forEach(s => seasonMap.set(`${s.competition.apiFootballId}-${s.apiFootballSeason}`, s.id));

  const now = new Date();
  const seasons = [now.getFullYear() - 1, now.getFullYear()];

  let created = 0;

  for (const teamCfg of TEAMS) {
    if (teamCfg.apiFootballId === 0) continue;

    try {
      for (const season of seasons) {
        const injuries = await apiGet<ApiInjury>('injuries', { team: teamCfg.apiFootballId, season });

        for (const injury of injuries) {
          const playerDbId = playerMap.get(injury.player.id);
          if (!playerDbId) continue;

          const approxDate = new Date(`${season}-01-01`);

          // Check for existing injury — match on player + type + season to avoid cross-season false positives
          const existing = await prisma.playerInjury.findFirst({
            where: { playerId: playerDbId, injuryType: injury.player.type, startDate: approxDate },
            select: { id: true },
          });
          if (existing) continue;

          await prisma.playerInjury.create({
            data: {
              playerId:   playerDbId,
              injuryType: injury.player.type || 'Unknown',
              bodyPart:   extractBodyPart(injury.player.reason),
              startDate:  approxDate,
            },
          });
          created++;
        }
      }
    } catch (err) {
      console.warn(`  [WARN] Injuries failed for ${teamCfg.countryName}: ${err}`);
    }
  }

  console.log(`  ${created} injury records created`);
}

function extractBodyPart(reason: string | null): string | null {
  if (!reason) return null;
  const lower = reason.toLowerCase();
  const parts = ['knee', 'hamstring', 'ankle', 'thigh', 'calf', 'shoulder', 'back', 'foot', 'hip', 'groin', 'muscle'];
  return parts.find(p => lower.includes(p)) ?? null;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function seedStats(prisma: PrismaClient) {
  await seedStandings(prisma);
  await seedPlayerSeasonStats(prisma);
  await seedTrophies(prisma);
  await seedInjuries(prisma);
}
