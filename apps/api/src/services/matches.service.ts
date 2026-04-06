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

  search(q: string, limit = 20) {
    const term = q.trim()
    if (!term) return Promise.resolve([])
    return this.prisma.match.findMany({
      where: {
        OR: [
          { homeTeam: { name:     { contains: term, mode: 'insensitive' } } },
          { awayTeam: { name:     { contains: term, mode: 'insensitive' } } },
          { homeTeam: { fifaCode: { contains: term, mode: 'insensitive' } } },
          { awayTeam: { fifaCode: { contains: term, mode: 'insensitive' } } },
          { competitionSeason: { competition: { name:      { contains: term, mode: 'insensitive' } } } },
          { competitionSeason: { competition: { shortName: { contains: term, mode: 'insensitive' } } } },
        ],
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

  findAll(teamId?: number, season?: number, competitionId?: number, status?: string, limit = 20) {
    return this.prisma.match.findMany({
      where: {
        ...(teamId        ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } : {}),
        ...(status        ? { statusShort: status }                                   : {}),
        ...(season        ? { competitionSeason: { apiFootballSeason: season } }      : {}),
        ...(competitionId ? { competitionSeason: { competitionId } }                  : {}),
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

  // Returns upcoming (NS / TBD / LINEUPS_CONFIRMED) matches ordered by kickoff date.
  // Filters: competitionId, teamId, from (ISO date string), to (ISO date string), limit.
  findUpcoming(
    competitionId?: number,
    teamId?:        number,
    from?:          string,
    to?:            string,
    limit = 20,
  ) {
    const fromDate = from ? new Date(from) : new Date()
    const toDate   = to   ? new Date(to)   : undefined

    return this.prisma.match.findMany({
      where: {
        statusShort:  { in: ['NS', 'TBD', 'PST'] },
        enrichStatus: { in: ['SCHEDULED', 'LINEUPS_CONFIRMED'] },
        kickoffAt: {
          gte: fromDate,
          ...(toDate ? { lte: toDate } : {}),
        },
        ...(teamId        ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } : {}),
        ...(competitionId ? { competitionSeason: { competitionId } }                 : {}),
      },
      include: {
        homeTeam:          { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        awayTeam:          { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        competitionSeason: { include: { competition: true } },
        venue:             { select: { id: true, name: true, city: true } },
        prediction:        true,
      },
      orderBy: { kickoffAt: 'asc' },
      take:    limit,
    })
  }

  async findLive() {
    const apiKey = this.config.get<string>('API_FOOTBALL_KEY')

    const teams = await this.prisma.nationalTeam.findMany({
      select: { id: true, name: true, apiFootballId: true, fifaCode: true, logoUrl: true },
    })
    const teamByApiId = new Map(teams.map(t => [t.apiFootballId, t]))
    const teamApiIds  = new Set(teams.map(t => t.apiFootballId))

    const res = await fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': apiKey! },
    })
    if (!res.ok) return []

    const json     = await res.json() as { response: any[] }
    const fixtures = json.response ?? []

    const live = fixtures.filter(
      f => teamApiIds.has(f.teams.home.id) && teamApiIds.has(f.teams.away.id),
    )

    return live.map(f => ({
      fixtureId: f.fixture.id,
      homeTeam:  teamByApiId.get(f.teams.home.id),
      awayTeam:  teamByApiId.get(f.teams.away.id),
      homeScore: f.goals.home  as number | null,
      awayScore: f.goals.away  as number | null,
      minute:    f.fixture.status.elapsed as number | null,
      status: {
        short:   f.fixture.status.short   as string,
        long:    f.fixture.status.long    as string,
        elapsed: f.fixture.status.elapsed as number | null,
        extra:   f.fixture.status.extra   as number | null,
      },
      competition: {
        apiId:  f.league.id     as number,
        name:   f.league.name   as string,
        logo:   f.league.logo   as string,
        round:  f.league.round  as string,
        season: f.league.season as number,
      },
      kickoffAt: f.fixture.date as string,
    }))
  }

  async findOne(id: number) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam:          { include: { country: true } },
        awayTeam:          { include: { country: true } },
        venue:             true,
        competitionSeason: { include: { competition: true } },
        teamStatistics:    true,
      },
    })
    if (!match) throw new NotFoundException(`Match ${id} not found`)
    return match
  }

  async findLineups(id: number) {
    await this.assertExists(id)
    return this.prisma.matchLineup.findMany({
      where: { matchId: id },
      include: {
        team:  { select: { id: true, name: true, fifaCode: true, logoUrl: true } },
        coach: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        lineupPlayers: {
          include: {
            player: {
              select: { id: true, firstName: true, lastName: true, commonName: true, photoUrl: true },
            },
          },
          orderBy: [{ isStarter: 'desc' }, { shirtNumber: 'asc' }],
        },
      },
    })
  }

  async findEvents(id: number) {
    await this.assertExists(id)
    return this.prisma.matchEvent.findMany({
      where: { matchId: id },
      include: {
        team:         { select: { id: true, name: true, fifaCode: true } },
        player:       { select: { id: true, firstName: true, lastName: true, commonName: true } },
        assistPlayer: { select: { id: true, firstName: true, lastName: true, commonName: true } },
      },
      orderBy: { minute: 'asc' },
    })
  }

  async findPlayerStats(id: number) {
    await this.assertExists(id)
    return this.prisma.playerMatchStats.findMany({
      where: { matchId: id },
      include: {
        player: {
          select: {
            id: true, firstName: true, lastName: true, commonName: true,
            position: true, photoUrl: true,
          },
        },
        team: { select: { id: true, name: true, fifaCode: true } },
      },
      orderBy: [{ team: { name: 'asc' } }, { minutesPlayed: 'desc' }],
    })
  }

  private async assertExists(id: number) {
    const match = await this.prisma.match.findUnique({ where: { id }, select: { id: true } })
    if (!match) throw new NotFoundException(`Match ${id} not found`)
  }
}
