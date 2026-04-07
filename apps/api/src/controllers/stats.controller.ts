import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger'
import { StatsService } from '../services/stats.service'

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('top-scorers')
  @ApiOperation({ summary: 'Top scorers across competitions' })
  @ApiQuery({ name: 'competitionId', required: false })
  @ApiQuery({ name: 'seasonYear',    required: false })
  @ApiQuery({ name: 'limit',         required: false })
  topScorers(
    @Query('competitionId') competitionId?: string,
    @Query('seasonYear')    seasonYear?:    string,
    @Query('limit')         limit?:         string,
  ) {
    return this.statsService.topScorers({
      competitionId: competitionId ? Number(competitionId) : undefined,
      seasonYear:    seasonYear    ? Number(seasonYear)    : undefined,
      limit:         limit         ? Number(limit)         : undefined,
    })
  }

  @Get('top-assists')
  @ApiOperation({ summary: 'Top assists across competitions' })
  @ApiQuery({ name: 'competitionId', required: false })
  @ApiQuery({ name: 'seasonYear',    required: false })
  @ApiQuery({ name: 'limit',         required: false })
  topAssists(
    @Query('competitionId') competitionId?: string,
    @Query('seasonYear')    seasonYear?:    string,
    @Query('limit')         limit?:         string,
  ) {
    return this.statsService.topAssists({
      competitionId: competitionId ? Number(competitionId) : undefined,
      seasonYear:    seasonYear    ? Number(seasonYear)    : undefined,
      limit:         limit         ? Number(limit)         : undefined,
    })
  }

  @Get('top-ratings')
  @ApiOperation({ summary: 'Top rated players (min 5 appearances)' })
  @ApiQuery({ name: 'competitionId', required: false })
  @ApiQuery({ name: 'seasonYear',    required: false })
  @ApiQuery({ name: 'limit',         required: false })
  topRatings(
    @Query('competitionId') competitionId?: string,
    @Query('seasonYear')    seasonYear?:    string,
    @Query('limit')         limit?:         string,
  ) {
    return this.statsService.topRatings({
      competitionId: competitionId ? Number(competitionId) : undefined,
      seasonYear:    seasonYear    ? Number(seasonYear)    : undefined,
      limit:         limit         ? Number(limit)         : undefined,
    })
  }

  @Get('team-rankings')
  @ApiOperation({ summary: 'Team rankings by points, win rate and goals' })
  @ApiQuery({ name: 'competitionId', required: false })
  @ApiQuery({ name: 'seasonYear',    required: false })
  @ApiQuery({ name: 'limit',         required: false })
  teamRankings(
    @Query('competitionId') competitionId?: string,
    @Query('seasonYear')    seasonYear?:    string,
    @Query('limit')         limit?:         string,
  ) {
    return this.statsService.teamRankings({
      competitionId: competitionId ? Number(competitionId) : undefined,
      seasonYear:    seasonYear    ? Number(seasonYear)    : undefined,
      limit:         limit         ? Number(limit)         : undefined,
    })
  }

  @Get('head-to-head/:teamA/:teamB')
  @ApiOperation({ summary: 'Head-to-head record between two teams' })
  @ApiParam({ name: 'teamA', description: 'NITBox team ID' })
  @ApiParam({ name: 'teamB', description: 'NITBox team ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max matches (default 10)' })
  headToHead(
    @Param('teamA', ParseIntPipe) teamA: number,
    @Param('teamB', ParseIntPipe) teamB: number,
    @Query('limit') limit?: string,
  ) {
    return this.statsService.headToHead(teamA, teamB, limit ? Number(limit) : undefined)
  }
}
