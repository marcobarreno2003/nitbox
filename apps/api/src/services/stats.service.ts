import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 5.1 Top Scorers ────────────────────────────────────────────────────────

  async topScorers(filters: { competitionId?: number; seasonYear?: number; limit?: number }) {
    const { competitionId, seasonYear, limit = 20 } = filters

    const rows = await this.prisma.playerSeasonStats.groupBy({
      by: ['playerId'],
      where: {
        goals: { gt: 0 },
        ...(competitionId || seasonYear
          ? {
              competitionSeason: {
                ...(competitionId ? { competitionId } : {}),
                ...(seasonYear    ? { apiFootballSeason: seasonYear } : {}),
              },
            }
          : {}),
      },
      _sum: { goals: true, appearances: true },
      orderBy: { _sum: { goals: 'desc' } },
      take: limit,
    })

    return this._attachPlayers(rows, r => ({
      goals:       r._sum.goals       ?? 0,
      appearances: r._sum.appearances ?? 0,
    }))
  }

  // ── 5.2 Top Assists ────────────────────────────────────────────────────────

  async topAssists(filters: { competitionId?: number; seasonYear?: number; limit?: number }) {
    const { competitionId, seasonYear, limit = 20 } = filters

    const rows = await this.prisma.playerSeasonStats.groupBy({
      by: ['playerId'],
      where: {
        assists: { gt: 0 },
        ...(competitionId || seasonYear
          ? {
              competitionSeason: {
                ...(competitionId ? { competitionId } : {}),
                ...(seasonYear    ? { apiFootballSeason: seasonYear } : {}),
              },
            }
          : {}),
      },
      _sum: { assists: true, appearances: true },
      orderBy: { _sum: { assists: 'desc' } },
      take: limit,
    })

    return this._attachPlayers(rows, r => ({
      assists:     r._sum.assists     ?? 0,
      appearances: r._sum.appearances ?? 0,
    }))
  }

  // ── 5.3 Top Ratings (min 5 appearances) ───────────────────────────────────

  async topRatings(filters: { competitionId?: number; seasonYear?: number; limit?: number }) {
    const { competitionId, seasonYear, limit = 20 } = filters

    const rows = await this.prisma.playerSeasonStats.groupBy({
      by: ['playerId'],
      where: {
        averageRating: { not: null },
        appearances:   { gte: 5 },
        ...(competitionId || seasonYear
          ? {
              competitionSeason: {
                ...(competitionId ? { competitionId } : {}),
                ...(seasonYear    ? { apiFootballSeason: seasonYear } : {}),
              },
            }
          : {}),
      },
      _avg: { averageRating: true },
      _sum: { appearances: true },
      orderBy: { _avg: { averageRating: 'desc' } },
      take: limit,
    })

    return this._attachPlayers(rows, r => ({
      averageRating: r._avg.averageRating ?? 0,
      appearances:   r._sum.appearances   ?? 0,
    }))
  }

  // ── 5.4 Team Rankings ──────────────────────────────────────────────────────

  async teamRankings(filters: { competitionId?: number; seasonYear?: number; limit?: number }) {
    const { competitionId, seasonYear, limit = 20 } = filters

    // Use precomputed TeamSeasonStats instead of re-aggregating from raw matches
    const rows = await this.prisma.teamSeasonStats.findMany({
      where: {
        ...(competitionId || seasonYear
          ? {
              competitionSeason: {
                ...(competitionId ? { competitionId } : {}),
                ...(seasonYear    ? { apiFootballSeason: seasonYear } : {}),
              },
            }
          : {}),
      },
      include: {
        team: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
      },
    })

    // Aggregate across competition-seasons per team (a team may have multiple entries)
    const byTeam = new Map<number, {
      team: { id: number; name: true; fifaCode: string | null; logoUrl: string | null }
      played: number; wins: number; draws: number; losses: number
      goalsFor: number; goalsAgainst: number
    }>()

    for (const r of rows) {
      const existing = byTeam.get(r.teamId)
      if (existing) {
        existing.played   += r.matchesPlayed
        existing.wins     += r.wins
        existing.draws    += r.draws
        existing.losses   += r.losses
        existing.goalsFor     += r.goalsFor
        existing.goalsAgainst += r.goalsAgainst
      } else {
        byTeam.set(r.teamId, {
          team:         r.team as any,
          played:       r.matchesPlayed,
          wins:         r.wins,
          draws:        r.draws,
          losses:       r.losses,
          goalsFor:     r.goalsFor,
          goalsAgainst: r.goalsAgainst,
        })
      }
    }

    const ranked = [...byTeam.values()]
      .map(s => ({
        ...s,
        points:         s.wins * 3 + s.draws,
        goalDifference: s.goalsFor - s.goalsAgainst,
        winRate:        s.played > 0 ? s.wins / s.played : 0,
      }))
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
      .slice(0, limit)

    return ranked.map((r, i) => ({
      rank: i + 1,
      ...r,
    }))
  }

  // ── 5.5 Head to Head ──────────────────────────────────────────────────────

  async headToHead(teamAId: number, teamBId: number, limit = 10) {
    const matches = await this.prisma.match.findMany({
      where: {
        statusShort: { in: ['FT', 'AET', 'PEN'] },
        OR: [
          { homeTeamId: teamAId, awayTeamId: teamBId },
          { homeTeamId: teamBId, awayTeamId: teamAId },
        ],
      },
      include: {
        homeTeam: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        awayTeam: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        competitionSeason: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
      },
      orderBy: { kickoffAt: 'desc' },
      take: limit,
    })

    // Summary stats
    let winsA = 0, winsB = 0, draws = 0, goalsA = 0, goalsB = 0

    for (const m of matches) {
      const aIsHome = m.homeTeamId === teamAId
      const ga = aIsHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0)
      const gb = aIsHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0)
      goalsA += ga; goalsB += gb
      if      (ga > gb) winsA++
      else if (ga < gb) winsB++
      else              draws++
    }

    // Derive team info from matches (already included) or fetch if no matches exist
    let teamA = matches.length
      ? (matches[0].homeTeamId === teamAId ? matches[0].homeTeam : matches[0].awayTeam)
      : null
    let teamB = matches.length
      ? (matches[0].homeTeamId === teamBId ? matches[0].homeTeam : matches[0].awayTeam)
      : null

    if (!teamA || !teamB) {
      const [a, b] = await Promise.all([
        !teamA ? this.prisma.nationalTeam.findUnique({ where: { id: teamAId }, select: { id: true, name: true, fifaCode: true, logoUrl: true } }) : null,
        !teamB ? this.prisma.nationalTeam.findUnique({ where: { id: teamBId }, select: { id: true, name: true, fifaCode: true, logoUrl: true } }) : null,
      ])
      teamA = teamA ?? a
      teamB = teamB ?? b
    }

    return {
      teamA,
      teamB,
      summary: { played: matches.length, winsA, winsB, draws, goalsA, goalsB },
      matches,
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _attachPlayers(
    rows: { playerId: number; [key: string]: any }[],
    pickStats: (r: any) => Record<string, any>,
  ) {
    const ids     = rows.map(r => r.playerId)
    const players = await this.prisma.player.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, commonName: true, firstName: true, lastName: true,
        position: true, photoUrl: true,
        nationality: { select: { name: true, isoAlpha2: true } },
        squadPlayers: {
          take: 1,
          include: { squad: { include: { team: { select: { id: true, name: true, fifaCode: true, logoUrl: true } } } } },
        },
      },
    })
    const playerMap = new Map(players.map(p => [p.id, p]))

    return rows.map((r, i) => ({
      rank:   i + 1,
      player: playerMap.get(r.playerId) ?? null,
      ...pickStats(r),
    }))
  }
}
