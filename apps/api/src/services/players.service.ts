import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findOne(id: number) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        nationality:  { select: { name: true, isoAlpha2: true } },
        birthCountry: { select: { name: true } },
        squadPlayers: {
          include: {
            squad: {
              include: { team: { select: { id: true, name: true, fifaCode: true, logoUrl: true } } },
            },
          },
        },
        // Last 5 match stats ordered by match date
        playerMatchStats: {
          take: 5,
          orderBy: { match: { kickoffAt: 'desc' } },
          include: {
            match: {
              select: {
                id: true,
                kickoffAt: true,
                homeScore: true,
                awayScore: true,
                statusShort: true,
                homeTeam: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
                awayTeam: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
                competitionSeason: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
              },
            },
          },
        },
        // All awards
        nitboxAwards: {
          orderBy: { createdAt: 'desc' },
          include: {
            match: {
              select: {
                id: true, kickoffAt: true,
                homeTeam: { select: { name: true, fifaCode: true } },
                awayTeam: { select: { name: true, fifaCode: true } },
              },
            },
            competitionSeason: {
              include: { competition: { select: { id: true, name: true, shortName: true } } },
            },
          },
        },
      },
    })
    if (!player) throw new NotFoundException(`Player ${id} not found`)
    return player
  }

  async findRating(id: number) {
    const player = await this.prisma.player.findUnique({ where: { id }, select: { id: true } })
    if (!player) throw new NotFoundException(`Player ${id} not found`)

    const mlUrl = this.config.get<string>('ML_SERVICE_URL', 'http://localhost:3003')
    try {
      const res = await fetch(`${mlUrl}/ratings/player/${id}`)
      if (!res.ok) return null
      return res.json()
    } catch {
      throw new ServiceUnavailableException('ML rating service is unavailable')
    }
  }

  async findStats(id: number, season?: number, competitionId?: number) {
    const player = await this.prisma.player.findUnique({ where: { id }, select: { id: true } })
    if (!player) throw new NotFoundException(`Player ${id} not found`)

    return this.prisma.playerSeasonStats.findMany({
      where: {
        playerId: id,
        ...(season        ? { competitionSeason: { apiFootballSeason: season } } : {}),
        ...(competitionId ? { competitionSeason: { competitionId } }              : {}),
      },
      include: {
        team:              { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        competitionSeason: { include: { competition: true } },
      },
      orderBy: { competitionSeason: { apiFootballSeason: 'desc' } },
    })
  }
}
