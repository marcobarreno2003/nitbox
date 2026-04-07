import { Module } from '@nestjs/common'
import { AwardsController } from '../../controllers/awards.controller'
import { AwardsService }    from '../../services/awards.service'

@Module({
  controllers: [AwardsController],
  providers:   [AwardsService],
})
export class AwardsModule {}
