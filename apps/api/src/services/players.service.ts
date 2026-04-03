import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:3003'

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    })
    if (!player) throw new NotFoundException(`Player ${id} not found`)
    return player
  }

  async findRating(id: number) {
    const player = await this.prisma.player.findUnique({ where: { id }, select: { id: true } })
    if (!player) throw new NotFoundException(`Player ${id} not found`)

    try {
      const res = await fetch(`${ML_URL}/ratings/player/${id}`)
      if (!res.ok) return null
      return res.json()
    } catch {
      return null   // ML service is optional — degrade gracefully
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
