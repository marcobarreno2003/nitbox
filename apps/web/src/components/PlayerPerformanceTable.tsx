'use client'

// =============================================================================
// PlayerPerformanceTable — shows player stats for both teams in a match.
// Columns: name, pos, min, rating, goals, assists, shots, passes, tackles.
// =============================================================================

import { useState } from 'react'
import PlayerModal from './PlayerModal'

interface PlayerStat {
  id: number
  player: {
    id:         number
    firstName:  string | null
    lastName:   string | null
    commonName: string | null
    position:   string | null
    photoUrl:   string | null
  }
  team: {
    id:      number
    name:    string
    fifaCode: string | null
  }
  minutesPlayed:   number | null
  rating:          number | null
  goals:           number | null
  assists:         number | null
  shotsTotal:      number | null
  shotsOnTarget:   number | null
  passesTotal:     number | null
  passAccuracyPct: number | null
  tacklesTotal:    number | null
  duelsWon:        number | null
  yellowCards:     number | null
  redCards:        number | null
  captain:         boolean
}

interface PlayerPerformanceTableProps {
  playerStats:  PlayerStat[]
  homeTeamId:   number
  awayTeamId:   number
  homeTeamName: string
  awayTeamName: string
}

function playerName(p: { firstName: string | null; lastName: string | null; commonName: string | null }): string {
  if (p.commonName) return p.commonName
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || '—'
}

function RatingBadge({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-text-muted">—</span>
  const color =
    rating >= 8 ? 'bg-green-500/20 text-green-400' :
    rating >= 7 ? 'bg-blue-500/20 text-blue-400'   :
    rating >= 6 ? 'bg-yellow-500/20 text-yellow-400':
                  'bg-red-500/20 text-red-400'
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${color}`}>
      {rating.toFixed(1)}
    </span>
  )
}

function PosTag({ pos }: { pos: string | null }) {
  const color =
    pos === 'G' ? 'bg-yellow-400/15 text-yellow-400' :
    pos === 'D' ? 'bg-blue-400/15 text-blue-400'     :
    pos === 'M' ? 'bg-green-400/15 text-green-400'   :
    pos === 'F' ? 'bg-red-400/15 text-red-400'       :
                  'bg-border text-text-muted'
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>
      {pos ?? '?'}
    </span>
  )
}

function TeamTable({
  players,
  onPlayerClick,
}: {
  players:       PlayerStat[]
  onPlayerClick: (id: number) => void
}) {
  if (!players.length) return <p className="text-xs text-text-muted text-center py-4">No player stats available</p>

  const sorted = [...players].sort((a, b) => {
    const posOrder = { G: 0, D: 1, M: 2, F: 3 }
    const aOrder = posOrder[a.player.position as keyof typeof posOrder] ?? 4
    const bOrder = posOrder[b.player.position as keyof typeof posOrder] ?? 4
    return aOrder - bOrder || (b.minutesPlayed ?? 0) - (a.minutesPlayed ?? 0)
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th className="text-left py-2 pr-3 font-medium">Player</th>
            <th className="text-center px-2 font-medium">Min</th>
            <th className="text-center px-2 font-medium">Rtg</th>
            <th className="text-center px-2 font-medium">G</th>
            <th className="text-center px-2 font-medium">A</th>
            <th className="text-center px-2 font-medium hidden sm:table-cell">Shots</th>
            <th className="text-center px-2 font-medium hidden md:table-cell">Pass%</th>
            <th className="text-center px-2 font-medium hidden md:table-cell">Tkl</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {sorted.map(ps => (
            <tr
              key={ps.id}
              className="hover:bg-border/10 cursor-pointer transition-colors"
              onClick={() => onPlayerClick(ps.player.id)}
            >
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <PosTag pos={ps.player.position} />
                  <span className="text-text-primary font-medium truncate max-w-[120px]">
                    {playerName(ps.player)}
                    {ps.captain && <span className="text-yellow-400 ml-1 text-[10px]">©</span>}
                  </span>
                </div>
              </td>
              <td className="text-center px-2 text-text-muted tabular-nums">{ps.minutesPlayed ?? '—'}'</td>
              <td className="text-center px-2"><RatingBadge rating={ps.rating} /></td>
              <td className="text-center px-2 tabular-nums font-semibold text-text-primary">{ps.goals ?? 0}</td>
              <td className="text-center px-2 tabular-nums text-text-muted">{ps.assists ?? 0}</td>
              <td className="text-center px-2 tabular-nums text-text-muted hidden sm:table-cell">
                {ps.shotsOnTarget ?? 0}/{ps.shotsTotal ?? 0}
              </td>
              <td className="text-center px-2 tabular-nums text-text-muted hidden md:table-cell">
                {ps.passAccuracyPct != null ? `${ps.passAccuracyPct}%` : '—'}
              </td>
              <td className="text-center px-2 tabular-nums text-text-muted hidden md:table-cell">
                {ps.tacklesTotal ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PlayerPerformanceTable({
  playerStats,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
}: PlayerPerformanceTableProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'home' | 'away'>('home')

  const homePlayers = playerStats.filter(p => p.team.id === homeTeamId)
  const awayPlayers = playerStats.filter(p => p.team.id === awayTeamId)

  if (!playerStats.length) return null

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Player Performance</h2>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'home'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {homeTeamName}
            </button>
            <button
              onClick={() => setActiveTab('away')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'away'
                  ? 'text-red-400 border-b-2 border-red-400'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {awayTeamName}
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'home'
              ? <TeamTable players={homePlayers} onPlayerClick={setSelectedPlayerId} />
              : <TeamTable players={awayPlayers} onPlayerClick={setSelectedPlayerId} />
            }
          </div>
        </div>
      </section>

      <PlayerModal
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />
    </>
  )
}
