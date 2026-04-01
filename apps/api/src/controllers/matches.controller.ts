import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { MatchesService } from '../services/matches.service'

@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOperation({
    summary: 'List matches',
    description: 'Returns all matches, ordered by date descending. Filter by team using the teamId query parameter.',
  })
  @ApiQuery({ name: 'teamId', required: false, description: 'Filter matches by NITBox team ID', example: 1 })
  @ApiResponse({ status: 200, description: 'List of matches.' })
  findAll(@Query('teamId') teamId?: string) {
    return this.matchesService.findAll(teamId ? Number(teamId) : undefined)
  }

  @Get('live')
  @ApiOperation({
    summary: 'Live matches',
    description: 'Returns all currently live matches involving our 60 national teams. Data is fetched in real-time from API-Football.',
  })
  @ApiResponse({ status: 200, description: 'List of live matches. Empty array if none are in progress.' })
  findLive() {
    return this.matchesService.findLive()
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a match by ID',
    description: 'Returns match detail including both teams, competition, and team statistics.',
  })
  @ApiParam({ name: 'id', description: 'NITBox internal match ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Match detail.' })
  @ApiResponse({ status: 404, description: 'Match not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.matchesService.findOne(id)
  }
}
