// PreMatchService — checks for confirmed lineups for upcoming matches.
//
// Runs every 15 minutes. For any match starting within 90 minutes that
// doesn't yet have confirmed lineups, it calls /fixtures/lineups and seeds
// them if the coaching staff has released them.

import { Injectable, Logger } from '@nestjs/common'
import { Cron }                from '@nestjs/schedule'
import { PrismaService }       from '../prisma/prisma.service'
import { ApiFootballClient, DailyLimitError } from './api-football.client'

@Injectable()
export class PreMatchService {
  private readonly logger = new Logger(PreMatchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly api:    ApiFootballClient,
  ) {}

  @Cron('*/15 * * * *')
  async checkUpcomingLineups() {
    try {
      await this.run()
    } catch (err) {
      if (err instanceof DailyLimitError) {
        this.logger.error('Daily API limit reached — pre-match check suspended')
      } else {
        this.logger.error('Pre-match lineup check failed', err)
      }
    }
  }

  private async run() {
    const now     = new Date()
    const cutoff  = new Date(now.getTime() + 90 * 60 * 1000)  // 90 minutes from now

    // Matches that are upcoming and haven't had lineups confirmed yet
    const upcoming = await this.prisma.match.findMany({
      where: {
        kickoffAt:    { gte: now, lte: cutoff },
        enrichStatus: { in: ['SCHEDULED'] },
        statusShort:  'NS',
      },
      include: {
        homeTeam: { select: { id: true, apiFootballId: true } },
        awayTeam: { select: { id: true, apiFootballId: true } },
      },
    })

    if (!upcoming.length) return

    this.logger.log(`Checking lineups for ${upcoming.length} upcoming match(es)`)

    for (const match of upcoming) {
      try {
        const confirmed = await this.fetchAndSeedLineups(match)
        if (confirmed) {
          await this.prisma.match.update({
            where: { id: match.id },
            data:  { enrichStatus: 'LINEUPS_CONFIRMED' },
          })
          this.logger.log(`Lineups confirmed for match ${match.id}`)
        }
      } catch (err) {
        if (err instanceof DailyLimitError) throw err
        this.logger.warn(`Lineup check failed for match ${match.id}: ${err}`)
      }
    }
  }

  // Returns true if lineups were found and seeded.
  private async fetchAndSeedLineups(match: {
    id: number
    apiFootballId: number
    homeTeam: { id: number; apiFootballId: number }
    awayTeam: { id: number; apiFootballId: number }
  }): Promise<boolean> {
    const data = await this.api.get<{ response: any[] }>(
      `/fixtures/lineups?fixture=${match.apiFootballId}`,
    )
    const entries = data.response ?? []
    if (!entries.length) return false

    const teamMap = new Map([
      [match.homeTeam.apiFootballId, match.homeTeam.id],
      [match.awayTeam.apiFootballId, match.awayTeam.id],
    ])

    for (const entry of entries) {
      const teamId = teamMap.get(entry.team.id)
      if (!teamId) continue

      // Resolve coach
      let coachId: number | null = null
      if (entry.coach?.id) {
        const coach = await this.prisma.coach.findFirst({
          where: { apiFootballId: entry.coach.id },
          select: { id: true },
        })
        coachId = coach?.id ?? null
      }

      const lineup = await this.prisma.matchLineup.upsert({
        where: { matchId_teamId: { matchId: match.id, teamId } },
        create: { matchId: match.id, teamId, coachId, formation: entry.formation ?? null },
        update: { coachId, formation: entry.formation ?? null },
      })

      const allPlayers = [
        ...(entry.startXI    ?? []).map((p: any) => ({ ...p.player, isStarter: true  })),
        ...(entry.substitutes ?? []).map((p: any) => ({ ...p.player, isStarter: false })),
      ]

      for (const lp of allPlayers) {
        if (!lp.id) continue
        const player = await this.prisma.player.findFirst({
          where: { apiFootballId: lp.id },
          select: { id: true },
        })
        if (!player) continue

        await this.prisma.lineupPlayer.upsert({
          where: { lineupId_playerId: { lineupId: lineup.id, playerId: player.id } },
          create: {
            lineupId:    lineup.id,
            playerId:    player.id,
            shirtNumber:  lp.number ?? null,
            positionCode: lp.pos    ?? null,
            gridPosition: lp.grid   ?? null,
            isStarter:    lp.isStarter,
          },
          update: {
            shirtNumber:  lp.number ?? null,
            positionCode: lp.pos    ?? null,
            gridPosition: lp.grid   ?? null,
          },
        })
      }
    }

    return true
  }
}
