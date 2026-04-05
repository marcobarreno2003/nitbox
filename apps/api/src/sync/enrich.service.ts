// EnrichService — called when a match reaches FT / AET / PEN.
//
// Fetches the full post-match dataset in one pass:
//   /fixtures/players    → PlayerMatchStats (one row per player)
//   /fixtures/lineups    → MatchLineup + LineupPlayer (final confirmed)
//   /fixtures/statistics → MatchTeamStatistics
//
// Also computes the PLAYER_OF_MATCH NitboxAward from the final player stats.
// Sets Match.enrichStatus = FULLY_ENRICHED when done.

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService }       from '../prisma/prisma.service'
import { ApiFootballClient, DailyLimitError } from './api-football.client'
import { StandingsLiveService } from './standings-live.service'

@Injectable()
export class EnrichService {
  private readonly logger = new Logger(EnrichService.name)
  // Prevent duplicate enrichment runs for the same match
  private readonly inProgress = new Set<number>()

  constructor(
    private readonly prisma:    PrismaService,
    private readonly api:       ApiFootballClient,
    private readonly standings: StandingsLiveService,
  ) {}

  async enrich(matchId: number, apiFixtureId: number) {
    if (this.inProgress.has(matchId)) return
    this.inProgress.add(matchId)

    try {
      this.logger.log(`Enriching match ${matchId} (fixture ${apiFixtureId})`)

      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          homeTeam: { select: { id: true, apiFootballId: true } },
          awayTeam: { select: { id: true, apiFootballId: true } },
        },
      })
      if (!match) return

      if (match.enrichStatus === 'FULLY_ENRICHED') {
        this.logger.debug(`Match ${matchId} already fully enriched — skipping`)
        return
      }

      const teamMap = new Map([
        [match.homeTeam.apiFootballId, match.homeTeam.id],
        [match.awayTeam.apiFootballId, match.awayTeam.id],
      ])

      await Promise.allSettled([
        this.enrichPlayerStats(matchId, apiFixtureId, teamMap),
        this.enrichLineups(matchId, apiFixtureId, teamMap),
        this.enrichTeamStats(matchId, apiFixtureId, teamMap),
      ])

      // Recompute final standings
      await this.standings.recalculateFinal(match.competitionSeasonId, match.groupId)

      // Calculate NitboxAward PLAYER_OF_MATCH
      await this.calculatePlayerOfMatch(matchId)

      await this.prisma.match.update({
        where: { id: matchId },
        data: { enrichStatus: 'FULLY_ENRICHED' },
      })

      this.logger.log(`Match ${matchId} fully enriched`)
    } catch (err) {
      if (err instanceof DailyLimitError) throw err
      this.logger.error(`Enrichment failed for match ${matchId}`, err)
    } finally {
      this.inProgress.delete(matchId)
    }
  }

  // ── Player Stats ───────────────────────────────────────────────────────────────

  private async enrichPlayerStats(matchId: number, apiFixtureId: number, teamMap: Map<number, number>) {
    const data = await this.api.get<{ response: any[] }>(`/fixtures/players?fixture=${apiFixtureId}`)
    const teamEntries = data.response ?? []
    if (!teamEntries.length) return

    for (const teamEntry of teamEntries) {
      const teamId = teamMap.get(teamEntry.team.id)
      if (!teamId) continue

      for (const entry of teamEntry.players ?? []) {
        const apiPlayerId = entry.player?.id
        if (!apiPlayerId) continue

        const player = await this.prisma.player.findFirst({
          where: { apiFootballId: apiPlayerId },
          select: { id: true },
        })
        if (!player) continue

        const s = entry.statistics?.[0]
        if (!s) continue

        const passAcc = s.passes?.accuracy
          ? parseFloat(String(s.passes.accuracy).replace('%', ''))
          : null

        await this.prisma.playerMatchStats.upsert({
          where: { matchId_playerId: { matchId, playerId: player.id } },
          create: {
            matchId, playerId: player.id, teamId,
            minutesPlayed:     s.games?.minutes     ?? null,
            rating:            s.games?.rating      ? parseFloat(s.games.rating) : null,
            captain:           s.games?.captain     ?? false,
            substitute:        s.games?.substitute  ?? false,
            goals:             s.goals?.total       ?? 0,
            goalsConceded:     s.goals?.conceded     ?? null,
            assists:           s.goals?.assists      ?? 0,
            saves:             s.goals?.saves        ?? null,
            shots:             s.shots?.total        ?? null,
            shotsOnTarget:     s.shots?.on           ?? null,
            passes:            s.passes?.total       ?? null,
            passesCompleted:   s.passes?.key != null ? null : null,  // not in API separately
            passAccuracyPct:   passAcc,
            keyPasses:         s.passes?.key         ?? null,
            tackles:           s.tackles?.total      ?? null,
            blockedShots:      s.tackles?.blocks     ?? null,
            interceptions:     s.tackles?.interceptions ?? null,
            duelsTotal:        s.duels?.total        ?? null,
            duelsWon:          s.duels?.won          ?? null,
            dribbles:          s.dribbles?.attempts  ?? null,
            dribblesCompleted: s.dribbles?.success   ?? null,
            dribblesPast:      s.dribbles?.past       ?? null,
            foulsCommitted:    s.fouls?.committed    ?? null,
            foulsSuffered:     s.fouls?.drawn        ?? null,
            yellowCards:       s.cards?.yellow       ?? 0,
            redCards:          s.cards?.red          ?? 0,
            offsides:          s.offsides            ?? null,
            penaltyWon:        s.penalty?.won        ?? null,
            penaltyCommitted:  s.penalty?.commited   ?? null,
            penaltyScored:     s.penalty?.scored     ?? null,
            penaltyMissed:     s.penalty?.missed     ?? null,
            penaltySaved:      s.penalty?.saved      ?? null,
          },
          update: {
            minutesPlayed:     s.games?.minutes     ?? null,
            rating:            s.games?.rating      ? parseFloat(s.games.rating) : null,
            goals:             s.goals?.total       ?? 0,
            assists:           s.goals?.assists      ?? 0,
            saves:             s.goals?.saves        ?? null,
            shots:             s.shots?.total        ?? null,
            shotsOnTarget:     s.shots?.on           ?? null,
            passes:            s.passes?.total       ?? null,
            passAccuracyPct:   passAcc,
            keyPasses:         s.passes?.key         ?? null,
            tackles:           s.tackles?.total      ?? null,
            blockedShots:      s.tackles?.blocks     ?? null,
            interceptions:     s.tackles?.interceptions ?? null,
            duelsTotal:        s.duels?.total        ?? null,
            duelsWon:          s.duels?.won          ?? null,
            dribbles:          s.dribbles?.attempts  ?? null,
            dribblesCompleted: s.dribbles?.success   ?? null,
            dribblesPast:      s.dribbles?.past       ?? null,
            foulsCommitted:    s.fouls?.committed    ?? null,
            foulsSuffered:     s.fouls?.drawn        ?? null,
            yellowCards:       s.cards?.yellow       ?? 0,
            redCards:          s.cards?.red          ?? 0,
            offsides:          s.offsides            ?? null,
          },
        })
      }
    }
  }

  // ── Lineups ────────────────────────────────────────────────────────────────────

  private async enrichLineups(matchId: number, apiFixtureId: number, teamMap: Map<number, number>) {
    const data = await this.api.get<{ response: any[] }>(`/fixtures/lineups?fixture=${apiFixtureId}`)
    const lineupEntries = data.response ?? []
    if (!lineupEntries.length) return

    for (const entry of lineupEntries) {
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
        where: { matchId_teamId: { matchId, teamId } },
        create: { matchId, teamId, coachId, formation: entry.formation ?? null },
        update: { coachId, formation: entry.formation ?? null },
      })

      const allPlayers = [
        ...( entry.startXI   ?? []).map((p: any) => ({ ...p.player, isStarter: true  })),
        ...( entry.substitutes ?? []).map((p: any) => ({ ...p.player, isStarter: false })),
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
            shirtNumber: lp.number   ?? null,
            positionCode: lp.pos     ?? null,
            gridPosition: lp.grid    ?? null,
            isStarter:   lp.isStarter,
          },
          update: {
            shirtNumber:  lp.number  ?? null,
            positionCode: lp.pos     ?? null,
            gridPosition: lp.grid    ?? null,
            isStarter:    lp.isStarter,
          },
        })
      }
    }
  }

  // ── Team Statistics ────────────────────────────────────────────────────────────

  private async enrichTeamStats(matchId: number, apiFixtureId: number, teamMap: Map<number, number>) {
    const data = await this.api.get<{ response: any[] }>(`/fixtures/statistics?fixture=${apiFixtureId}`)
    const entries = data.response ?? []
    if (!entries.length) return

    for (const entry of entries) {
      const teamId = teamMap.get(entry.team.id)
      if (!teamId) continue

      const stats: Record<string, any> = {}
      for (const s of entry.statistics ?? []) {
        const v = s.value
        switch (s.type) {
          case 'Ball Possession':    stats.possessionPct    = v ? parseFloat(String(v)) : null; break
          case 'Total Shots':        stats.shots            = v ?? null; break
          case 'Shots on Goal':      stats.shotsOnTarget    = v ?? null; break
          case 'Shots off Goal':     stats.shotsOffTarget   = v ?? null; break
          case 'Blocked Shots':      stats.shotsBlocked     = v ?? null; break
          case 'Shots insidebox':    stats.shotsInsideBox   = v ?? null; break
          case 'Shots outsidebox':   stats.shotsOutsideBox  = v ?? null; break
          case 'expected_goals':     stats.xG               = v ? parseFloat(String(v)) : null; break
          case 'goals_prevented':    stats.goalsPrevented   = v ? parseFloat(String(v)) : null; break
          case 'Total passes':       stats.passes           = v ?? null; break
          case 'Passes accurate':    stats.passesCompleted  = v ?? null; break
          case 'Passes %':           stats.passAccuracyPct  = v ? parseFloat(String(v)) : null; break
          case 'Corner Kicks':       stats.corners          = v ?? null; break
          case 'Fouls':              stats.fouls            = v ?? null; break
          case 'Yellow Cards':       stats.yellowCards      = v ?? null; break
          case 'Red Cards':          stats.redCards         = v ?? null; break
          case 'Offsides':           stats.offsides         = v ?? null; break
          case 'Goalkeeper Saves':   stats.saves            = v ?? null; break
        }
      }

      const isHome = (await this.prisma.match.findUnique({
        where: { id: matchId },
        select: { homeTeamId: true },
      }))?.homeTeamId === teamId

      await this.prisma.matchTeamStatistics.upsert({
        where: { matchId_teamId: { matchId, teamId } },
        create: { matchId, teamId, isHome, ...stats },
        update: stats,
      })
    }
  }

  // ── NitboxAward: Player of the Match ──────────────────────────────────────────
  // Scoring formula (position-aware):
  //   Outfield: goals*20 + assists*12 + keyPasses*3 + (rating*5) + tackles*2 + interceptions*2
  //   GK:       saves*15 + (rating*7) + (goalsConceded==0 ? 20 : 0) + tackles*2

  private async calculatePlayerOfMatch(matchId: number) {
    const playerStats = await this.prisma.playerMatchStats.findMany({
      where: { matchId },
      include: { player: { select: { position: true } } },
    })

    if (!playerStats.length) return

    let topScore = -1
    let topPlayerId: number | null = null

    for (const ps of playerStats) {
      if (!ps.minutesPlayed || ps.minutesPlayed < 20) continue

      const isGK = ps.player.position === 'G' || ps.player.position === 'GK'
      const rating = ps.rating ?? 6.0

      let score: number
      if (isGK) {
        score = (ps.saves ?? 0) * 15
             + rating * 7
             + ((ps.goalsConceded ?? 1) === 0 ? 20 : 0)
             + (ps.tackles ?? 0) * 2
      } else {
        score = (ps.goals ?? 0) * 20
             + (ps.assists ?? 0) * 12
             + (ps.keyPasses ?? 0) * 3
             + rating * 5
             + (ps.tackles ?? 0) * 2
             + (ps.interceptions ?? 0) * 2
      }

      // Normalize to 90 mins
      score = score * (90 / Math.max(ps.minutesPlayed, 1))

      if (score > topScore) {
        topScore    = score
        topPlayerId = ps.playerId
      }
    }

    if (!topPlayerId) return

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { competitionSeason: { select: { apiFootballSeason: true } } },
    })

    await this.prisma.nitboxAward.upsert({
      where: { type_matchId: { type: 'PLAYER_OF_MATCH', matchId } },
      create: {
        type: 'PLAYER_OF_MATCH',
        playerId:   topPlayerId,
        matchId,
        seasonYear: match?.competitionSeason?.apiFootballSeason ?? new Date().getFullYear(),
        score:      topScore,
      },
      update: { playerId: topPlayerId, score: topScore },
    })

    this.logger.log(`NitboxAward PLAYER_OF_MATCH for match ${matchId} → player ${topPlayerId} (score ${topScore.toFixed(1)})`)
  }
}
