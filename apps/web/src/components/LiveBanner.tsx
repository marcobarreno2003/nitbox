'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface LiveMatch {
  fixtureId:  number
  homeTeam:   { name: string; fifaCode: string | null } | null
  awayTeam:   { name: string; fifaCode: string | null } | null
  homeScore:  number | null
  awayScore:  number | null
  status: {
    short:   string
    elapsed: number | null
    extra:   number | null
  }
  competition: { name: string }
}

function minuteLabel(match: LiveMatch): string {
  const { short, elapsed, extra } = match.status
  if (short === 'HT') return 'HT'
  if (short === 'ET') return `ET ${elapsed ?? ''}${extra ? '+' + extra : ''}'`
  if (short === 'P')  return 'PEN'
  if (elapsed !== null) return `${elapsed}${extra ? '+' + extra : ''}'`
  return short
}

export default function LiveBanner() {
  const [matches, setMatches] = useState<LiveMatch[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch(`${API_URL}/matches/live`, { cache: 'no-store' })
        const data = await res.json()
        setMatches(Array.isArray(data) ? data : [])
      } catch {
        // silently fail — banner just won't show
      }
    }
    load()
  }, [])

  if (matches.length === 0) return null

  return (
    <Link
      href="/live"
      className="block bg-surface border border-border rounded-xl overflow-hidden hover:border-accent/40 transition-colors group"
    >
      <div className="flex items-center gap-4 px-5 py-4 overflow-x-auto scrollbar-none">

        {/* Live badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
          </span>
          <span className="text-accent text-xs font-bold tracking-wider uppercase">Live</span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border shrink-0" />

        {/* Match pills */}
        <div className="flex items-center gap-3 flex-nowrap">
          {matches.map((match) => (
            <MatchPill key={match.fixtureId} match={match} />
          ))}
        </div>

        {/* Arrow */}
        <span className="text-text-muted group-hover:text-accent transition-colors text-sm shrink-0 ml-auto">
          →
        </span>
      </div>
    </Link>
  )
}

function MatchPill({ match }: { match: LiveMatch }) {
  const home = match.homeTeam?.fifaCode ?? match.homeTeam?.name ?? '—'
  const away = match.awayTeam?.fifaCode ?? match.awayTeam?.name ?? '—'
  const min  = minuteLabel(match)

  return (
    <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-1.5 shrink-0">
      <span className="text-xs text-text-muted font-mono">{min}</span>
      <span className="w-px h-3 bg-border" />
      <span className="text-sm font-medium text-text-primary tabular-nums">
        {home}
        <span className="text-accent font-bold mx-1.5">
          {match.homeScore ?? 0}–{match.awayScore ?? 0}
        </span>
        {away}
      </span>
    </div>
  )
}
