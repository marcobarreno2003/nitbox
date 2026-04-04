import Link from 'next/link'
import { apiFetch, formatDate, formatTime, statusLabel, isLive, type Match } from '@/lib/api'

export const revalidate = 120

async function getMatches(): Promise<Match[]> {
  const data = await apiFetch<Match[]>('/matches?limit=50', 120)
  return data ?? []
}

function MatchCard({ match }: { match: Match }) {
  const live    = isLive(match.statusShort)
  const status  = statusLabel(match)
  const hasScore = match.homeScore !== null && match.awayScore !== null

  return (
    <Link
      href={`/matches/${match.id}`}
      className="group bg-surface border border-border rounded-xl p-4 hover:border-accent/40 transition-colors block"
    >
      {/* Competition + date row */}
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
            <span className="text-sm font-semibold text-text-primary truncate">
              {match.homeTeam.fifaCode ?? match.homeTeam.name}
            </span>
          </div>
          <span className={`text-sm font-bold shrink-0 tabular-nums ${hasScore ? 'text-text-primary' : 'text-text-muted'}`}>
            {hasScore ? match.homeScore : '–'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {match.awayTeam.logoUrl && (
              <img src={match.awayTeam.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className="text-sm font-medium text-text-muted truncate">
              {match.awayTeam.fifaCode ?? match.awayTeam.name}
            </span>
          </div>
          <span className={`text-sm font-bold shrink-0 tabular-nums ${hasScore ? 'text-text-muted' : 'text-text-muted'}`}>
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

export default async function MatchesPage() {
  const matches = await getMatches()

  const live      = matches.filter(m => isLive(m.statusShort))
  const finished  = matches.filter(m => m.statusShort === 'FT' || m.statusShort === 'AET' || m.statusShort === 'PEN')
  const upcoming  = matches.filter(m => m.statusShort === 'NS')

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">

      <div>
        <h1 className="text-3xl font-bold text-text-primary">Matches</h1>
        <p className="text-text-muted mt-1 text-sm">National team results across all competitions</p>
      </div>

      {/* Live */}
      {live.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-green-400 uppercase tracking-widest">Live now</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {live.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* Recent results */}
      {finished.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Recent results</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {finished.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Upcoming</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {upcoming.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {matches.length === 0 && (
        <div className="text-center py-24 text-text-muted">
          <p className="text-4xl mb-4">⚽</p>
          <p>No matches found.</p>
        </div>
      )}

    </div>
  )
}
