import { Module } from '@nestjs/common'
import { TeamsController } from '../../controllers/teams.controller'
import { TeamsService } from '../../services/teams.service'

@Module({
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
