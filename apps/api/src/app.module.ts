import { Module }           from '@nestjs/common'
import { ConfigModule }     from '@nestjs/config'
import { ScheduleModule }   from '@nestjs/schedule'
import { PrismaModule }     from './prisma/prisma.module'
import { TeamsModule }        from './routes/teams/teams.module'
import { MatchesModule }      from './routes/matches/matches.module'
import { StandingsModule }    from './routes/standings/standings.module'
import { PlayersModule }      from './routes/players/players.module'
import { CompetitionsModule } from './routes/competitions/competitions.module'
import { AwardsModule }       from './routes/awards/awards.module'
import { StatsModule }        from './routes/stats/stats.module'
import { SyncModule }         from './sync/sync.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TeamsModule,
    MatchesModule,
    StandingsModule,
    PlayersModule,
    CompetitionsModule,
    AwardsModule,
    StatsModule,
    SyncModule,
  ],
})
export class AppModule {}
