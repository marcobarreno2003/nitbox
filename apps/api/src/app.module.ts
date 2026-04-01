import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { TeamsModule }        from './routes/teams/teams.module'
import { MatchesModule }      from './routes/matches/matches.module'
import { StandingsModule }    from './routes/standings/standings.module'
import { PlayersModule }      from './routes/players/players.module'
import { CompetitionsModule } from './routes/competitions/competitions.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    TeamsModule,
    MatchesModule,
    StandingsModule,
    PlayersModule,
    CompetitionsModule,
  ],
})
export class AppModule {}
