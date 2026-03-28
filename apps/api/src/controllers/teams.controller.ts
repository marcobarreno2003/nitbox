import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { TeamsService } from '../services/teams.service'

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findAll() {
    return this.teamsService.findAll()
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findOne(id)
  }
}
