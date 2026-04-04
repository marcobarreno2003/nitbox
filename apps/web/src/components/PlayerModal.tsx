'use client'

import { useEffect, useState } from 'react'
import PlayerCard, { type PlayerRating } from './PlayerCard'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface PlayerProfile {
  id: number
  commonName: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  nationality: { name: string; isoAlpha2: string } | null
}

interface PlayerModalProps {
  playerId: number | null
  onClose: () => void
}

export default function PlayerModal({ playerId, onClose }: PlayerModalProps) {
  const [player, setPlayer]   = useState<PlayerProfile | null>(null)
  const [rating, setRating]   = useState<PlayerRating | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!playerId) { setPlayer(null); setRating(null); return }
    setLoading(true)
    setPlayer(null)
    setRating(null)
    Promise.all([
      fetch(`${API}/players/${playerId}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/players/${playerId}/rating`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([p, r]) => {
      setPlayer(p)
      setRating(r)
      setLoading(false)
    })
  }, [playerId])

  if (!playerId) return null

  const countryCode = player?.nationality?.isoAlpha2?.toLowerCase()
  const flagUrl = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : null
  const displayName = player
    ? (player.commonName ?? [player.firstName, player.lastName].filter(Boolean).join(' '))
    : null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card wrapper — stop click propagation so backdrop-click only closes when clicking outside */}
      <div
        className="relative animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-surface border border-border text-text-muted hover:text-text-primary hover:border-accent/60 transition-colors flex items-center justify-center text-base font-bold leading-none"
          aria-label="Close"
        >
          ×
        </button>

        {loading && (
          <div className="rounded-2xl border border-border bg-surface p-10 w-64 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            <p className="text-text-muted text-sm">Loading...</p>
          </div>
        )}

        {!loading && rating && (
          <PlayerCard
            rating={rating}
            photoUrl={player?.photoUrl}
            nationality={player?.nationality?.isoAlpha2?.toUpperCase()}
            flagUrl={flagUrl}
            size="md"
          />
        )}

        {!loading && !rating && (
          <div className="rounded-2xl border border-border bg-surface p-8 w-64 text-center space-y-2">
            {player?.photoUrl && (
              <img
                src={player.photoUrl}
                alt=""
                className="w-16 h-16 rounded-full object-cover mx-auto border border-border"
              />
            )}
            {displayName && (
              <p className="text-text-primary text-sm font-semibold">{displayName}</p>
            )}
            <p className="text-text-muted text-xs">No rating data available</p>
            <p className="text-text-muted/50 text-xs">Start the ML service to generate ratings.</p>
          </div>
        )}
      </div>
    </div>
  )
}
