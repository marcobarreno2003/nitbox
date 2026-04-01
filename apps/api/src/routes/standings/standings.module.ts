import { Module } from '@nestjs/common'
import { StandingsController } from '../../controllers/standings.controller'
import { StandingsService } from '../../services/standings.service'

@Module({
  controllers: [StandingsController],
  providers:   [StandingsService],
})
export class StandingsModule {}
