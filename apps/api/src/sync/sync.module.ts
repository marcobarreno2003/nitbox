import { Module }             from '@nestjs/common'
import { ApiFootballClient }  from './api-football.client'
import { LiveSyncService }    from './live-sync.service'
import { PreMatchService }    from './pre-match.service'
import { EnrichService }      from './enrich.service'
import { StandingsLiveService } from './standings-live.service'

@Module({
  providers: [
    ApiFootballClient,
    StandingsLiveService,
    EnrichService,       // EnrichService before LiveSyncService (LiveSync injects it)
    LiveSyncService,
    PreMatchService,
  ],
  exports: [
    EnrichService,
    StandingsLiveService,
  ],
})
export class SyncModule {}
