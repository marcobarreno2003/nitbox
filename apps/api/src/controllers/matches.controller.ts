import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { MatchesService } from '../services/matches.service'

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  findAll(@Query('teamId') teamId?: string) {
    return this.matchesService.findAll(teamId ? Number(teamId) : undefined)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.matchesService.findOne(id)
  }
}
