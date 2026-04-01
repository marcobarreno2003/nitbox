import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { TeamsService } from '../services/teams.service'

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List all 60 national teams' })
  @ApiResponse({ status: 200, description: 'Array of national teams with country and confederation.' })
  findAll() {
    return this.teamsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Team profile' })
  @ApiParam({ name: 'id', description: 'NITBox team ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Team profile with country and home venue.' })
  @ApiResponse({ status: 404, description: 'Team not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findOne(id)
  }

  @Get(':id/matches')
  @ApiOperation({ summary: 'Team match history' })
  @ApiParam({ name: 'id', description: 'NITBox team ID' })
  @ApiQuery({ name: 'season',      required: false, description: 'Filter by season year (e.g. 2025)' })
  @ApiQuery({ name: 'competition', required: false, description: 'Filter by competition ID' })
  @ApiQuery({ name: 'limit',       required: false, description: 'Max results (default 10)' })
  @ApiResponse({ status: 200, description: 'List of finished matches for the team.' })
  findMatches(
    @Param('id', ParseIntPipe) id: number,
    @Query('season')      season?:      string,
    @Query('competition') competition?: string,
    @Query('limit')       limit?:       string,
  ) {
    return this.teamsService.findMatches(
      id,
      season      ? Number(season)      : undefined,
      competition ? Number(competition) : undefined,
      limit       ? Number(limit)       : 10,
    )
  }

  @Get(':id/squad')
  @ApiOperation({ summary: 'Current squad' })
  @ApiParam({ name: 'id', description: 'NITBox team ID' })
  @ApiResponse({ status: 200, description: 'All players in the team\'s current squad.' })
  findSquad(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findSquad(id)
  }

  @Get(':id/standings')
  @ApiOperation({ summary: 'Team standings across all competitions' })
  @ApiParam({ name: 'id', description: 'NITBox team ID' })
  @ApiResponse({ status: 200, description: 'Standings entries for the team.' })
  findStandings(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findStandings(id)
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Team season statistics' })
  @ApiParam({ name: 'id', description: 'NITBox team ID' })
  @ApiQuery({ name: 'season', required: false, description: 'Filter by season year' })
  @ApiResponse({ status: 200, description: 'Team season stats per competition.' })
  findStats(
    @Param('id', ParseIntPipe) id: number,
    @Query('season') season?: string,
  ) {
    return this.teamsService.findStats(id, season ? Number(season) : undefined)
  }
}
