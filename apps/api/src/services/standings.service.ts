import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(competitionId: number, season: number) {
    return this.prisma.standing.findMany({
      where: {
        competitionSeason: {
          competitionId,
          apiFootballSeason: season,
        },
      },
      include: {
        team: { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        group: { select: { id: true, name: true, stage: true } },
        competitionSeason: { include: { competition: true } },
      },
      orderBy: { position: 'asc' },
    })
  }
}
