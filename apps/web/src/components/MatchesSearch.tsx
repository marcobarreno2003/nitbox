'use client'

import { useState, useEffect, useRef } from 'react'
import MatchCard from './MatchCard'
import { type Match } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export default function MatchesSearch() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setLoading(false); return }

    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/matches/search?q=${encodeURIComponent(q)}&limit=24`)
        const data: Match[] = res.ok ? await res.json() : []
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const isActive = query.trim().length > 0

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
          {/* Status row */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              {loading
                ? 'Searching…'
                : results.length === 0
                ? `No matches found for "${query.trim()}"`
                : `${results.length} match${results.length !== 1 ? 'es' : ''} for "${query.trim()}"`
              }
            </p>
            {loading && (
              <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            )}
          </div>

          {/* Match grid */}
          {!loading && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {results.map(m => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
