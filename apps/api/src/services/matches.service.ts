import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(teamId?: number) {
    return this.prisma.match.findMany({
      where: teamId
        ? {
            OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          }
        : undefined,
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
      },
      orderBy: { date: 'desc' },
    })
  }

  async findOne(id: number) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        stats: true,
      },
    })
    if (!match) throw new NotFoundException(`Match ${id} not found`)
    return match
  }
}
