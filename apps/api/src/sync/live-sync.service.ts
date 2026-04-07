// LiveSyncService — polls API-Football every minute for matches currently in progress.
//
// Responsibilities:
//  1. Find all LIVE matches in the DB (or matches that should be live based on time)
//  2. Fetch the latest score + status from /fixtures?id=
//  3. Fetch all events from /fixtures/events and persist only new ones
//  4. Trigger provisional standings recalculation on new goals
//  5. Trigger EnrichService when a match reaches FT / AET / PEN

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService }        from '../prisma/prisma.service'
import { ApiFootballClient, DailyLimitError } from './api-football.client'
import { EnrichService }        from './enrich.service'
import { StandingsLiveService } from './standings-live.service'

// API-Football status codes that mean the match is currently being played
const LIVE_STATUSES  = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE'])
// Status codes that mean the match has ended
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN'])

@Injectable()
export class LiveSyncService {
  private readonly logger = new Logger(LiveSyncService.name)
  // Guards against re-entrant executions if a tick takes > 1 minute
  private running = false

  constructor(
    private readonly prisma:    PrismaService,
    private readonly api:       ApiFootballClient,
    private readonly enrich:    EnrichService,
    private readonly standings: StandingsLiveService,
  ) {}

  // Runs every minute. Skips if a previous tick is still processing.
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.syncAll()
    } catch (err) {
      if (err instanceof DailyLimitError) {
        this.logger.error('Daily API limit reached — live sync suspended for today')
      } else {
        this.logger.error('Live sync error', err)
      }
    } finally {
      this.running = false
    }
  }

  private async syncAll() {
    // Find matches that are LIVE in our DB, or have just kicked off
    const liveMatches = await this.prisma.match.findMany({
      where: {
        OR: [
          { enrichStatus: 'LIVE' },
          // Also catch matches that kicked off but we haven't marked LIVE yet
          {
            statusShort: { in: [...LIVE_STATUSES] },
            enrichStatus: { in: ['SCHEDULED', 'LINEUPS_CONFIRMED'] },
          },
        ],
      },
      select: { id: true, apiFootballId: true, homeTeamId: true, awayTeamId: true,
                homeScore: true, awayScore: true, enrichStatus: true,
                competitionSeasonId: true, groupId: true },
    })

    if (!liveMatches.length) return

    this.logger.log(`Syncing ${liveMatches.length} live match(es)`)

    for (const match of liveMatches) {
      try {
        await this.syncOne(match)
      } catch (err) {
        if (err instanceof DailyLimitError) throw err  // Propagate to abort the loop
        this.logger.warn(`Failed to sync match ${match.id}: ${err}`)
      }
    }
  }

  private async syncOne(match: {
    id: number
    apiFootballId: number
    homeTeamId: number
    awayTeamId: number
    homeScore: number | null
    awayScore: number | null
    enrichStatus: string
    competitionSeasonId: number
    groupId: number | null
  }) {
    // 1. Fetch latest fixture status + score
    const fixtureData = await this.api.get<{ response: any[] }>(`/fixtures?id=${match.apiFootballId}`)
    const fixture = fixtureData.response?.[0]
    if (!fixture) return

    const newStatus   = fixture.fixture.status.short as string
    const newElapsed  = fixture.fixture.status.elapsed as number | null
    const newExtra    = fixture.fixture.status.extra   as number | null
    const newHomeScore = fixture.goals.home as number | null
    const newAwayScore = fixture.goals.away as number | null

    // Detect new goals to trigger provisional standings update
    const prevHome = match.homeScore ?? 0
    const prevAway = match.awayScore ?? 0
    const currHome = newHomeScore ?? 0
    const currAway = newAwayScore ?? 0
    const newGoal  = currHome !== prevHome || currAway !== prevAway

    // 2. Update match row
    await this.prisma.match.update({
      where: { id: match.id },
      data: {
        statusShort:   newStatus,
        statusElapsed: newElapsed,
        statusExtra:   newExtra,
        homeScore:     newHomeScore,
        awayScore:     newAwayScore,
        enrichStatus:  FINAL_STATUSES.has(newStatus) ? 'FULLY_ENRICHED'
                       : LIVE_STATUSES.has(newStatus) ? 'LIVE'
                       : match.enrichStatus as any,
        ...(FINAL_STATUSES.has(newStatus) ? {
          homeScoreHt: fixture.score?.halftime?.home  ?? null,
          awayScoreHt: fixture.score?.halftime?.away  ?? null,
          homeScoreEt: fixture.score?.extratime?.home ?? null,
          awayScoreEt: fixture.score?.extratime?.away ?? null,
          homePenScore: fixture.score?.penalty?.home  ?? null,
          awayPenScore: fixture.score?.penalty?.away  ?? null,
        } : {}),
      },
    })

    // 3. Fetch and persist new events
    await this.syncEvents(match.id, match.apiFootballId, match.homeTeamId, match.awayTeamId)

    // 4. Trigger provisional standings on new goal
    if (newGoal) {
      await this.standings.recalculateProvisional(
        match.competitionSeasonId,
        match.groupId,
        match.id,
        match.homeTeamId,
        currHome,
        match.awayTeamId,
        currAway,
      )
    }

    // 5. Trigger full enrichment when match ends
    if (FINAL_STATUSES.has(newStatus) && match.enrichStatus !== 'FULLY_ENRICHED') {
      this.logger.log(`Match ${match.id} finished (${newStatus}) — scheduling enrichment`)
      // Run async so we don't block the polling loop
      this.enrich.enrich(match.id, match.apiFootballId).catch(err =>
        this.logger.error(`Enrichment failed for match ${match.id}`, err),
      )
    }
  }

  private async syncEvents(
    matchId: number,
    apiFixtureId: number,
    homeTeamId: number,
    awayTeamId: number,
  ) {
    const data = await this.api.get<{ response: any[] }>(`/fixtures/events?fixture=${apiFixtureId}`)
    const apiEvents = data.response ?? []
    if (!apiEvents.length) return

    // Build a set of already-stored events using a stable fingerprint
    const existing = await this.prisma.matchEvent.findMany({
      where: { matchId },
      select: { minute: true, type: true, detail: true, playerId: true },
    })
    const existingSet = new Set(
      existing.map((e: { minute: number | null; type: string | null; detail: string | null; playerId: number | null }) => `${e.minute}|${e.type}|${e.detail}|${e.playerId ?? ''}`)
    )

    // Resolve team IDs from API IDs
    const teams = await this.prisma.nationalTeam.findMany({
      where: { apiFootballId: { in: [homeTeamId, awayTeamId] } },
      select: { id: true, apiFootballId: true },
    })
    // Actually homeTeamId/awayTeamId are already our internal IDs — we need API IDs
    // Get the full match to resolve this
    const matchRow = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { id: true, apiFootballId: true } },
        awayTeam: { select: { id: true, apiFootballId: true } },
      },
    })
    if (!matchRow) return

    const teamMap = new Map([
      [matchRow.homeTeam.apiFootballId, matchRow.homeTeam.id],
      [matchRow.awayTeam.apiFootballId, matchRow.awayTeam.id],
    ])

    // Build running score tracker for scoreHome/scoreAway on each event
    let runHome = 0
    let runAway = 0

    for (const ev of apiEvents) {
      const teamInternalId = teamMap.get(ev.team.id)
      if (!teamInternalId) continue

      // Resolve player if API provides an ID
      let playerId: number | null = null
      let assistPlayerId: number | null = null
      if (ev.player?.id) {
        const p = await this.prisma.player.findFirst({
          where: { apiFootballId: ev.player.id },
          select: { id: true },
        })
        playerId = p?.id ?? null
      }
      if (ev.assist?.id) {
        const p = await this.prisma.player.findFirst({
          where: { apiFootballId: ev.assist.id },
          select: { id: true },
        })
        assistPlayerId = p?.id ?? null
      }

      // Update running score
      if (ev.type === 'Goal' && ev.detail !== 'Missed Penalty') {
        if (teamInternalId === matchRow.homeTeamId) runHome++
        else runAway++
      }

      const fingerprint = `${ev.time.elapsed}|${ev.type}|${ev.detail}|${playerId ?? ''}`
      if (existingSet.has(fingerprint)) continue

      await this.prisma.matchEvent.create({
        data: {
          matchId,
          teamId:        teamInternalId,
          playerId,
          assistPlayerId,
          minute:        ev.time.elapsed,
          extraTime:     ev.time.extra ?? null,
          type:          ev.type,
          detail:        ev.detail ?? null,
          comments:      ev.comments ?? null,
          scoreHome:     runHome,
          scoreAway:     runAway,
        },
      })
      existingSet.add(fingerprint)
    }
  }
}
