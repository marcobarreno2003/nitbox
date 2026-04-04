import Link from 'next/link'
import { isLive, statusLabel, formatDate, formatTime, type Match } from '@/lib/api'

export default function MatchCard({ match }: { match: Match }) {
  const live     = isLive(match.statusShort)
  const status   = statusLabel(match)
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const homeWin  = hasScore && match.homeScore! > match.awayScore!
  const awayWin  = hasScore && match.awayScore! > match.homeScore!

  return (
    <Link
      href={`/matches/${match.id}`}
      className="group bg-surface border border-border rounded-xl p-4 hover:border-accent/40 transition-colors block"
    >
      {/* Competition + status row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-muted text-xs truncate max-w-[160px]">
          {match.competitionSeason.competition.name} · {match.competitionSeason.apiFootballSeason}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {live && (
            <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          )}
          <span className={`text-xs font-medium ${live ? 'text-green-400' : 'text-text-muted'}`}>
            {status}
          </span>
        </div>
      </div>

      {/* Teams + score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {match.homeTeam.logoUrl && (
              <img src={match.homeTeam.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className={`text-sm font-semibold truncate ${homeWin ? 'text-text-primary' : 'text-text-muted'}`}>
              {match.homeTeam.fifaCode ?? match.homeTeam.name}
            </span>
          </div>
          <span className={`text-sm shrink-0 tabular-nums ${homeWin ? 'text-text-primary font-black' : 'text-text-muted font-bold'}`}>
            {hasScore ? match.homeScore : '–'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {match.awayTeam.logoUrl && (
              <img src={match.awayTeam.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className={`text-sm font-semibold truncate ${awayWin ? 'text-text-primary' : 'text-text-muted'}`}>
              {match.awayTeam.fifaCode ?? match.awayTeam.name}
            </span>
          </div>
          <span className={`text-sm shrink-0 tabular-nums ${awayWin ? 'text-text-primary font-black' : 'text-text-muted font-bold'}`}>
            {hasScore ? match.awayScore : '–'}
          </span>
        </div>
      </div>

      {/* Date / time */}
      {!live && (
        <p className="text-text-muted text-xs mt-3 pt-3 border-t border-border">
          {formatDate(match.kickoffAt)}
          {match.statusShort === 'NS' && match.kickoffAt && (
            <span className="ml-1">· {formatTime(match.kickoffAt)}</span>
          )}
        </p>
      )}
    </Link>
  )
}
