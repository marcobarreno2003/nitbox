import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io'

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  findAll(teamId?: number) {
    return this.prisma.match.findMany({
      where: teamId
        ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] }
        : undefined,
      include: {
        homeTeam: true,
        awayTeam: true,
        competitionSeason: {
          include: { competition: true },
        },
      },
      orderBy: { kickoffAt: 'desc' },
    })
  }

  async findLive() {
    const apiKey = this.config.get<string>('API_FOOTBALL_KEY')

    // Get all 60 national teams for filtering
    const teams = await this.prisma.nationalTeam.findMany({
      select: { id: true, name: true, apiFootballId: true, fifaCode: true, logoUrl: true },
    })
    const teamByApiId = new Map(teams.map(t => [t.apiFootballId, t]))
    const teamApiIds  = new Set(teams.map(t => t.apiFootballId))

    const res  = await fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': apiKey! },
      // Node 18+ native fetch — no cache so each call is fresh
      cache: 'no-store' as RequestCache,
    })

    if (!res.ok) return []

    const json     = await res.json() as { response: any[] }
    const fixtures = json.response ?? []

    // Keep only matches where BOTH teams are in our 60
    const live = fixtures.filter(
      f => teamApiIds.has(f.teams.home.id) && teamApiIds.has(f.teams.away.id),
    )

    return live.map(f => ({
      fixtureId:  f.fixture.id,
      homeTeam:   teamByApiId.get(f.teams.home.id),
      awayTeam:   teamByApiId.get(f.teams.away.id),
      homeScore:  f.goals.home as number | null,
      awayScore:  f.goals.away as number | null,
      minute:     f.fixture.status.elapsed as number | null,
      status: {
        short:   f.fixture.status.short  as string,
        long:    f.fixture.status.long   as string,
        elapsed: f.fixture.status.elapsed as number | null,
        extra:   f.fixture.status.extra  as number | null,
      },
      competition: {
        apiId:  f.league.id    as number,
        name:   f.league.name  as string,
        logo:   f.league.logo  as string,
        round:  f.league.round as string,
        season: f.league.season as number,
      },
      kickoffAt: f.fixture.date as string,
    }))
  }

  async findOne(id: number) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: true,
        awayTeam: true,
        competitionSeason: {
          include: { competition: true },
        },
        teamStatistics: true,
      },
    })
    if (!match) throw new NotFoundException(`Match ${id} not found`)
    return match
  }
}
