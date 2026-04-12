'use client'

import { useState, useRef } from 'react'
import MatchCard from './MatchCard'
import { type Match } from '@/lib/api'

interface Props {
  matches: Match[]
}

export default function MatchesSearch({ matches }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const q = query.trim().toLowerCase()

  const filtered = q
    ? matches.filter(m => {
        const haystack = [
          m.homeTeam.name,
          m.awayTeam.name,
          m.homeTeam.fifaCode,
          m.awayTeam.fifaCode,
          m.competitionSeason?.competition?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    : []

  const isActive = q.length > 0

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search teams, competitions… (e.g. Brazil, Copa America, ARG)"
          className={`
            w-full bg-surface border rounded-xl pl-10 pr-10 py-3
            text-text-primary placeholder:text-text-muted text-sm
            outline-none transition-colors
            ${focused ? 'border-accent/60' : 'border-border'}
          `}
        />

        {/* Clear button */}
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Results */}
      {isActive && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            {filtered.length === 0
              ? `No matches found for "${query.trim()}"`
              : `${filtered.length} match${filtered.length !== 1 ? 'es' : ''} for "${query.trim()}"`
            }
          </p>

          {filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filtered.slice(0, 24).map(m => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
