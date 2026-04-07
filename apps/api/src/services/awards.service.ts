import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AwardsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    type?:          string
    seasonYear?:    number
    competitionId?: number
    limit?:         number
  }) {
    const { type, seasonYear, competitionId, limit = 50 } = filters

    return this.prisma.nitboxAward.findMany({
      where: {
        ...(type        ? { type: type as any }                           : {}),
        ...(seasonYear  ? { seasonYear }                                  : {}),
        ...(competitionId ? { competitionSeason: { competitionId } }      : {}),
      },
      include: {
        player: {
          select: {
            id: true, commonName: true, firstName: true, lastName: true,
            position: true, photoUrl: true,
            nationality: { select: { name: true, isoAlpha2: true } },
          },
        },
        match: {
          select: {
            id: true, kickoffAt: true, homeScore: true, awayScore: true,
            homeTeam: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
            awayTeam: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
          },
        },
        competitionSeason: {
          include: { competition: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
        },
      },
      orderBy: [{ seasonYear: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })
  }
}
