import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { PlayersService } from '../services/players.service'

@ApiTags('players')
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Player profile' })
  @ApiParam({ name: 'id', description: 'NITBox player ID' })
  @ApiResponse({ status: 200, description: 'Player profile with nationality and squad info.' })
  @ApiResponse({ status: 404, description: 'Player not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.playersService.findOne(id)
  }

  @Get(':id/rating')
  @ApiOperation({ summary: 'Player attribute ratings (PAC/SHO/PAS/DRI/DEF/PHY)' })
  @ApiParam({ name: 'id', description: 'NITBox player ID' })
  @ApiResponse({ status: 200, description: 'Percentile-based attribute ratings from ML service.' })
  findRating(@Param('id', ParseIntPipe) id: number) {
    return this.playersService.findRating(id)
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Player season statistics' })
  @ApiParam({ name: 'id', description: 'NITBox player ID' })
  @ApiQuery({ name: 'season',      required: false, description: 'Filter by season year' })
  @ApiQuery({ name: 'competition', required: false, description: 'Filter by competition ID' })
  @ApiResponse({ status: 200, description: 'Season stats per competition, newest first.' })
  findStats(
    @Param('id', ParseIntPipe) id: number,
    @Query('season')      season?:      string,
    @Query('competition') competition?: string,
  ) {
    return this.playersService.findStats(
      id,
      season      ? Number(season)      : undefined,
      competition ? Number(competition) : undefined,
    )
  }
}
