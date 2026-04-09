// StandingsLiveService — recalculates standings during and after a match.
//
// Provisional: called on every new goal during a live match. Recalculates
//   only the two teams involved so the table reflects the current score.
//
// Final: called by EnrichService after full enrichment. Recomputes every team
//   in the group from scratch using all completed matches.

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class StandingsLiveService {
  private readonly logger = new Logger(StandingsLiveService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── Provisional (called on every new goal during live match) ─────────────────
  // Only updates the two teams in this match to reflect the current score.
  // Does NOT touch other teams in the group.
  async recalculateProvisional(
    competitionSeasonId: number,
    groupId: number | null,
    liveMatchId: number,
    homeTeamId: number,
    currentHomeScore: number,
    awayTeamId: number,
    currentAwayScore: number,
  ) {
    try {
      await this.updateTeamProvisional(
        competitionSeasonId, groupId,
        homeTeamId, awayTeamId,
        currentHomeScore, currentAwayScore,
        liveMatchId,
      )
      await this.updateTeamProvisional(
        competitionSeasonId, groupId,
        awayTeamId, homeTeamId,
        currentAwayScore, currentHomeScore,
        liveMatchId,
      )
    } catch (err) {
      this.logger.warn(`Provisional standings failed for match ${liveMatchId}: ${err}`)
    }
  }

  private async updateTeamProvisional(
    competitionSeasonId: number,
    groupId: number | null,
    teamId: number,
    opponentId: number,
    teamScore: number,
    opponentScore: number,
    liveMatchId: number,
  ) {
    // All finished matches for this team in this competition (excluding live match)
    const finished = await this.prisma.match.findMany({
      where: {
        competitionSeasonId,
        ...(groupId ? { groupId } : {}),
        id: { not: liveMatchId },
        statusShort: { in: ['FT', 'AET', 'PEN'] },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
    })

    const stats = this.aggregateMatchResults(teamId, finished)

    // Add the provisional result from the live match
    if (teamScore > opponentScore) {
      stats.won++;  stats.points += 3; stats.goalsFor += teamScore; stats.goalsAgainst += opponentScore
    } else if (teamScore === opponentScore) {
      stats.drawn++; stats.points += 1; stats.goalsFor += teamScore; stats.goalsAgainst += opponentScore
    } else {
      stats.lost++;  stats.goalsFor += teamScore; stats.goalsAgainst += opponentScore
    }
    stats.played++
    stats.goalDifference = stats.goalsFor - stats.goalsAgainst

    // Use findFirst + update/create to handle nullable groupId in compound unique key
    // (Prisma upsert doesn't support null in compound unique — NULL != NULL in PostgreSQL)
    const existing = await this.prisma.standing.findFirst({
      where: { competitionSeasonId, groupId: groupId ?? undefined, teamId },
    })
    if (existing) {
      await this.prisma.standing.update({ where: { id: existing.id }, data: stats })
    } else {
      await this.prisma.standing.create({
        data: { competitionSeasonId, groupId, teamId, position: 0, ...stats },
      })
    }
  }

  // ── Final (called by EnrichService after match is fully enriched) ─────────────
  // Recomputes ALL teams in the group from all completed matches.
  async recalculateFinal(competitionSeasonId: number, groupId: number | null) {
    try {
      const finishedMatches = await this.prisma.match.findMany({
        where: {
          competitionSeasonId,
          ...(groupId ? { groupId } : {}),
          statusShort: { in: ['FT', 'AET', 'PEN'] },
        },
      })

      // Collect all team IDs in this group
      const teamIds = new Set<number>()
      for (const m of finishedMatches) {
        teamIds.add(m.homeTeamId)
        teamIds.add(m.awayTeamId)
      }

      const teamStats: Record<number, ReturnType<typeof this.emptyStats>> = {}
      for (const tid of teamIds) {
        const relevant = finishedMatches.filter(
          (m: typeof finishedMatches[number]) => m.homeTeamId === tid || m.awayTeamId === tid,
        )
        teamStats[tid] = this.aggregateMatchResults(tid, relevant)
        teamStats[tid].goalDifference = teamStats[tid].goalsFor - teamStats[tid].goalsAgainst
      }

      // Sort by points → goal difference → goals for to assign positions
      const sorted = [...teamIds].sort((a, b) => {
        const sa = teamStats[a], sb = teamStats[b]
        return sb.points - sa.points
            || sb.goalDifference - sa.goalDifference
            || sb.goalsFor - sa.goalsFor
      })

      for (let i = 0; i < sorted.length; i++) {
        const teamId = sorted[i]
        const stats  = teamStats[teamId]
        const updateData = { position: i + 1, ...stats }

        // Use findFirst + update/create to handle nullable groupId in compound unique key
        const existing = await this.prisma.standing.findFirst({
          where: { competitionSeasonId, groupId: groupId ?? undefined, teamId },
        })
        if (existing) {
          await this.prisma.standing.update({ where: { id: existing.id }, data: updateData })
        } else {
          await this.prisma.standing.create({
            data: { competitionSeasonId, groupId, teamId, ...updateData },
          })
        }
      }

      this.logger.log(`Final standings recalculated for season ${competitionSeasonId} / group ${groupId}`)
    } catch (err) {
      this.logger.error(`Final standings failed for season ${competitionSeasonId}: ${err}`)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private emptyStats() {
    return { played: 0, won: 0, drawn: 0, lost: 0, points: 0,
             goalsFor: 0, goalsAgainst: 0, goalDifference: 0 }
  }

  private aggregateMatchResults(teamId: number, matches: any[]) {
    const s = this.emptyStats()
    for (const m of matches) {
      const isHome   = m.homeTeamId === teamId
      const teamGoals = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0)
      const oppGoals  = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0)
      s.played++
      s.goalsFor      += teamGoals
      s.goalsAgainst  += oppGoals
      if (teamGoals > oppGoals)      { s.won++;   s.points += 3 }
      else if (teamGoals === oppGoals) { s.drawn++; s.points += 1 }
      else                             { s.lost++ }
    }
    return s
  }
}
