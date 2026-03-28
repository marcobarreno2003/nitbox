import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.country.findMany({
      orderBy: { name: 'asc' },
    })
  }

  async findOne(id: number) {
    const team = await this.prisma.country.findUnique({ where: { id } })
    if (!team) throw new NotFoundException(`Team ${id} not found`)
    return team
  }
}
