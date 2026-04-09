import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.nationalTeam.findMany({
      include: {
        country: { include: { confederation: true } },
      },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(id: number) {
    const team = await this.prisma.nationalTeam.findUnique({
      where: { id },
      include: {
        country: { include: { confederation: true } },
      },
    })
    if (!team) throw new NotFoundException(`Team ${id} not found`)
    return team
  }

  async findMatches(id: number, season?: number, competitionId?: number, limit = 10) {
    await this.assertExists(id)
    return this.prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: id }, { awayTeamId: id }],
        statusShort: { in: ['FT', 'AET', 'PEN'] },
        ...(season       ? { competitionSeason: { apiFootballSeason: season } }           : {}),
        ...(competitionId ? { competitionSeason: { competitionId } }                       : {}),
      },
      include: {
        homeTeam:          { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        awayTeam:          { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        competitionSeason: { include: { competition: true } },
      },
      orderBy: { kickoffAt: 'desc' },
      take: limit,
    })
  }

  async findSquad(id: number) {
    await this.assertExists(id)
    // Current squad uses competitionSeasonId: null as the marker (set by 05-players seeder)
    const squad = await this.prisma.squad.findFirst({
      where: { teamId: id, competitionSeasonId: null },
    })
    if (!squad) throw new NotFoundException(`No squad found for team ${id}`)
    return this.prisma.squadPlayer.findMany({
      where: { squadId: squad.id },
      include: {
        player: {
          include: {
            nationality:  { select: { name: true, isoAlpha2: true } },
            birthCountry: { select: { name: true } },
          },
        },
      },
      orderBy: { player: { position: 'asc' } },
    })
  }

  async findStandings(id: number) {
    await this.assertExists(id)
    return this.prisma.standing.findMany({
      where: { teamId: id },
      include: {
        competitionSeason: {
          include: { competition: true },
        },
      },
      orderBy: { competitionSeason: { apiFootballSeason: 'desc' } },
    })
  }

  async findStats(id: number, season?: number) {
    await this.assertExists(id)
    return this.prisma.teamSeasonStats.findMany({
      where: {
        teamId: id,
        ...(season ? { competitionSeason: { apiFootballSeason: season } } : {}),
      },
      include: {
        competitionSeason: { include: { competition: true } },
      },
      orderBy: { competitionSeason: { apiFootballSeason: 'desc' } },
    })
  }

  private async assertExists(id: number) {
    const team = await this.prisma.nationalTeam.findUnique({ where: { id }, select: { id: true } })
    if (!team) throw new NotFoundException(`Team ${id} not found`)
  }
}
