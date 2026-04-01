import { Controller, Get, ParseIntPipe, Query, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { StandingsService } from '../services/standings.service'

@ApiTags('standings')
@Controller('standings')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Competition standings table',
    description: 'Returns the standings table for a specific competition and season.',
  })
  @ApiQuery({ name: 'competition', required: true,  description: 'Competition ID',   example: 1 })
  @ApiQuery({ name: 'season',      required: true,  description: 'Season year',       example: 2025 })
  @ApiResponse({ status: 200, description: 'Standings ordered by position.' })
  @ApiResponse({ status: 400, description: 'competition and season are required.' })
  findAll(
    @Query('competition') competition?: string,
    @Query('season')      season?:      string,
  ) {
    if (!competition || !season) {
      throw new BadRequestException('Query params "competition" and "season" are required')
    }
    return this.standingsService.findAll(Number(competition), Number(season))
  }
}
