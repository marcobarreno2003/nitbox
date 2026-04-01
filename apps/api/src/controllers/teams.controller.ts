import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import { TeamsService } from '../services/teams.service'

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all national teams',
    description: 'Returns all 60 national teams tracked by NITBox, ordered by name.',
  })
  @ApiResponse({ status: 200, description: 'List of national teams.' })
  findAll() {
    return this.teamsService.findAll()
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a team by ID',
    description: 'Returns the full profile of a national team including country and confederation.',
  })
  @ApiParam({ name: 'id', description: 'NITBox internal team ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Team profile.' })
  @ApiResponse({ status: 404, description: 'Team not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findOne(id)
  }
}
