import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { AwardsService } from '../services/awards.service'

@ApiTags('awards')
@Controller('awards')
export class AwardsController {
  constructor(private readonly awardsService: AwardsService) {}

  @Get()
  @ApiOperation({ summary: 'List NITBox awards with optional filters' })
  @ApiQuery({ name: 'type',          required: false, description: 'PLAYER_OF_MATCH | PLAYER_OF_SEASON | PLAYER_OF_CUP | BEST_DEFENSIVE' })
  @ApiQuery({ name: 'seasonYear',    required: false, description: 'e.g. 2024' })
  @ApiQuery({ name: 'competitionId', required: false, description: 'Competition DB id' })
  @ApiQuery({ name: 'limit',         required: false, description: 'Max results (default 50)' })
  findAll(
    @Query('type')          type?:          string,
    @Query('seasonYear')    seasonYear?:    string,
    @Query('competitionId') competitionId?: string,
    @Query('limit')         limit?:         string,
  ) {
    return this.awardsService.findAll({
      type,
      seasonYear:    seasonYear    ? Number(seasonYear)    : undefined,
      competitionId: competitionId ? Number(competitionId) : undefined,
      limit:         limit         ? Number(limit)         : undefined,
    })
  }
}
