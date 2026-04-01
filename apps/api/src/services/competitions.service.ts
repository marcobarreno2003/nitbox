import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.competition.findMany({
      include: {
        confederation: true,
        seasons: {
          orderBy: { apiFootballSeason: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(id: number) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      include: {
        confederation: true,
        seasons: { orderBy: { apiFootballSeason: 'desc' } },
      },
    })
    if (!competition) throw new NotFoundException(`Competition ${id} not found`)
    return competition
  }
}
