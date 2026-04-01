'use client'

import { useEffect, useState, useCallback } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const POLL_INTERVAL_MS = 30_000

interface LiveTeam {
  id: number
  name: string
  fifaCode: string | null
  logoUrl:  string | null
}

interface LiveMatch {
  fixtureId:  number
  homeTeam:   LiveTeam
  awayTeam:   LiveTeam
  homeScore:  number | null
  awayScore:  number | null
  minute:     number | null
  status: {
    short:   string
    long:    string
    elapsed: number | null
    extra:   number | null
  }
  competition: {
    apiId:  number
    name:   string
    logo:   string
    round:  string
    season: number
  }
  kickoffAt: string
}

function minuteLabel(match: LiveMatch): string {
  const { short, elapsed, extra } = match.status
  if (short === 'HT')  return 'HT'
  if (short === 'ET')  return `ET ${elapsed ?? ''}${extra ? '+' + extra : ''}'`
  if (short === 'P')   return 'PEN'
  if (short === 'BT')  return 'Break'
  if (elapsed !== null) return `${elapsed}${extra ? '+' + extra : ''}'`
  return short
}

function isLiveStatus(short: string) {
  return ['1H', '2H', 'HT', 'ET', 'P', 'BT'].includes(short)
}

export default function LivePage() {
  const [matches, setMatches]     = useState<LiveMatch[]>([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000)

  const fetchLive = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/matches/live`, { cache: 'no-store' })
      const data = await res.json()
      setMatches(Array.isArray(data) ? data : [])
      setLastUpdate(new Date())
      setCountdown(POLL_INTERVAL_MS / 1000)
    } catch {
      // silently keep stale data on network error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLive()
    const poll = setInterval(fetchLive, POLL_INTERVAL_MS)
    return () => clearInterval(poll)
  }, [fetchLive])

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-16 space-y-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
          </span>
          <h1 className="text-2xl font-bold text-text-primary">Live Matches</h1>
        </div>
        {lastUpdate && (
          <p className="text-text-muted text-xs">
            Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' · '}
            <span className={countdown <= 5 ? 'text-accent' : ''}>
              refreshing in {countdown}s
            </span>
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-3 bg-border rounded w-1/3" />
              <div className="h-5 bg-border rounded w-2/3" />
              <div className="h-5 bg-border rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Live matches */}
      {!loading && matches.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((match) => (
            <LiveMatchCard key={match.fixtureId} match={match} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && matches.length === 0 && (
        <EmptyState />
      )}

    </div>
  )
}

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const live    = isLiveStatus(match.status.short)
  const minLabel = minuteLabel(match)

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4 hover:border-accent/40 transition-colors">

      {/* Competition + status */}
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs truncate max-w-[65%]">
          {match.competition.name} · {match.competition.round}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {live && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
          )}
          <span className={`text-xs font-semibold tabular-nums ${live ? 'text-accent' : 'text-text-muted'}`}>
            {minLabel}
          </span>
        </div>
      </div>

      {/* Teams + score */}
      <div className="space-y-2.5">
        <TeamRow
          name={match.homeTeam?.name ?? '—'}
          code={match.homeTeam?.fifaCode}
          score={match.homeScore}
          isWinning={(match.homeScore ?? 0) > (match.awayScore ?? 0)}
        />
        <TeamRow
          name={match.awayTeam?.name ?? '—'}
          code={match.awayTeam?.fifaCode}
          score={match.awayScore}
          isWinning={(match.awayScore ?? 0) > (match.homeScore ?? 0)}
        />
      </div>

      {/* Footer */}
      <p className="text-text-muted text-xs pt-1 border-t border-border">
        {match.competition.season} season
      </p>
    </div>
  )
}

function TeamRow({
  name,
  code,
  score,
  isWinning,
}: {
  name: string
  code: string | null | undefined
  score: number | null
  isWinning: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {code && (
          <span className="text-text-muted text-xs font-mono shrink-0 w-7">{code}</span>
        )}
        <span className={`text-sm font-medium truncate ${isWinning ? 'text-text-primary' : 'text-text-muted'}`}>
          {name}
        </span>
      </div>
      <span className={`text-lg font-bold tabular-nums shrink-0 ${isWinning ? 'text-accent' : 'text-text-muted'}`}>
        {score ?? '—'}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
      <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5 text-text-muted"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-text-primary font-semibold text-base">No matches live right now</p>
        <p className="text-text-muted text-sm mt-1">
          Check back during international match windows.
        </p>
      </div>
      <p className="text-text-muted text-xs">
        This page refreshes automatically every 30 seconds.
      </p>
    </div>
  )
}
