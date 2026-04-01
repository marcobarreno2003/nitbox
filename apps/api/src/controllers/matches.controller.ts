import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { MatchesService } from '../services/matches.service'

@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOperation({ summary: 'List matches', description: 'Returns finished matches. Supports multiple filters.' })
  @ApiQuery({ name: 'teamId',      required: false, description: 'Filter by team ID' })
  @ApiQuery({ name: 'season',      required: false, description: 'Filter by season year (e.g. 2025)' })
  @ApiQuery({ name: 'competition', required: false, description: 'Filter by competition ID' })
  @ApiQuery({ name: 'status',      required: false, description: 'Filter by status (FT, AET, PEN)' })
  @ApiQuery({ name: 'limit',       required: false, description: 'Max results (default 20)' })
  @ApiResponse({ status: 200, description: 'List of matches.' })
  findAll(
    @Query('teamId')      teamId?:      string,
    @Query('season')      season?:      string,
    @Query('competition') competition?: string,
    @Query('status')      status?:      string,
    @Query('limit')       limit?:       string,
  ) {
    return this.matchesService.findAll(
      teamId      ? Number(teamId)      : undefined,
      season      ? Number(season)      : undefined,
      competition ? Number(competition) : undefined,
      status,
      limit       ? Number(limit)       : 20,
    )
  }

  @Get('live')
  @ApiOperation({ summary: 'Live matches', description: 'Real-time live matches involving our 60 teams.' })
  @ApiResponse({ status: 200, description: 'Live matches. Empty array if none in progress.' })
  findLive() {
    return this.matchesService.findLive()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Match detail' })
  @ApiParam({ name: 'id', description: 'NITBox match ID' })
  @ApiResponse({ status: 200, description: 'Full match detail with team statistics.' })
  @ApiResponse({ status: 404, description: 'Match not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.matchesService.findOne(id)
  }

  @Get(':id/lineups')
  @ApiOperation({ summary: 'Match lineups', description: 'Starting XI and substitutes for both teams.' })
  @ApiParam({ name: 'id', description: 'NITBox match ID' })
  @ApiResponse({ status: 200, description: 'Lineups for both teams.' })
  findLineups(@Param('id', ParseIntPipe) id: number) {
    return this.matchesService.findLineups(id)
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Match events', description: 'Goals, cards, and substitutions in chronological order.' })
  @ApiParam({ name: 'id', description: 'NITBox match ID' })
  @ApiResponse({ status: 200, description: 'Match events ordered by minute.' })
  findEvents(@Param('id', ParseIntPipe) id: number) {
    return this.matchesService.findEvents(id)
  }

  @Get(':id/players')
  @ApiOperation({ summary: 'Player stats for a match', description: 'Individual player statistics for every player that appeared.' })
  @ApiParam({ name: 'id', description: 'NITBox match ID' })
  @ApiResponse({ status: 200, description: 'Player stats grouped by team.' })
  findPlayerStats(@Param('id', ParseIntPipe) id: number) {
    return this.matchesService.findPlayerStats(id)
  }
}
