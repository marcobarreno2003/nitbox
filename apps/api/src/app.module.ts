import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TeamsModule } from './routes/teams/teams.module'
import { MatchesModule } from './routes/matches/matches.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    TeamsModule,
    MatchesModule,
  ],
})
export class AppModule {}
