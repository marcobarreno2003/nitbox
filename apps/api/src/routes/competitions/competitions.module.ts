import { Module } from '@nestjs/common'
import { CompetitionsController } from '../../controllers/competitions.controller'
import { CompetitionsService } from '../../services/competitions.service'

@Module({
  controllers: [CompetitionsController],
  providers:   [CompetitionsService],
})
export class CompetitionsModule {}
