import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import { CompetitionsService } from '../services/competitions.service'

@ApiTags('competitions')
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all competitions', description: 'Returns all 12 competitions tracked by NITBox.' })
  @ApiResponse({ status: 200, description: 'List of competitions with confederation and latest season.' })
  findAll() {
    return this.competitionsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Competition detail' })
  @ApiParam({ name: 'id', description: 'NITBox competition ID' })
  @ApiResponse({ status: 200, description: 'Competition with all seeded seasons.' })
  @ApiResponse({ status: 404, description: 'Competition not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.competitionsService.findOne(id)
  }
}
