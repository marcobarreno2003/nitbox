'use client'

import { useState } from 'react'
import FormationPitch from './FormationPitch'
import PlayerModal from './PlayerModal'
import { playerName, type Lineup, type MatchEvent, type Team } from '@/lib/api'

// ── Event icons ───────────────────────────────────────────────────────────────

function EventIcon({ type, detail }: { type: string; detail: string | null }) {
  if (type === 'Goal') {
    if (detail === 'Own Goal') return <span title="Own goal">⚽🔴</span>
    if (detail === 'Penalty')  return <span title="Penalty goal">⚽🎯</span>
    return <span title="Goal">⚽</span>
  }
  if (type === 'Card') {
    if (detail === 'Yellow Card')     return <span title="Yellow card">🟨</span>
    if (detail === 'Red Card')        return <span title="Red card">🟥</span>
    if (detail === 'Yellow Red Card') return <span title="Second yellow">🟨🟥</span>
  }
  if (type === 'subst') return <span title="Substitution">🔄</span>
  return <span>{type[0]}</span>
}

function EventRow({
  event,
  homeTeamId,
  onPlayerClick,
}: {
  event: MatchEvent
  homeTeamId: number
  onPlayerClick: (id: number) => void
}) {
  const isHome = event.team.id === homeTeamId
  const name   = playerName(event.player)
  const assist = event.assistPlayer ? playerName(event.assistPlayer) : null
  const min    = event.minute != null
    ? `${event.minute}${event.extraMinute ? '+' + event.extraMinute : ''}'`
    : '—'

  return (
    <div className={`flex items-center gap-3 py-2 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
      <span className="text-text-muted text-xs font-mono w-10 shrink-0 text-center">{min}</span>
      <span className="text-base shrink-0"><EventIcon type={event.type} detail={event.detail} /></span>
      <div className={`flex flex-col min-w-0 ${isHome ? 'items-start' : 'items-end'}`}>
        <button
          onClick={() => event.player && onPlayerClick(event.player.id)}
          className={`text-sm font-medium text-text-primary truncate hover:text-accent transition-colors text-left ${event.player ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {name}
        </button>
        {assist && <span className="text-xs text-text-muted truncate">+ {assist}</span>}
      </div>
    </div>
  )
}

// ── Bench list ────────────────────────────────────────────────────────────────

function BenchList({ lineup, onPlayerClick }: { lineup: Lineup; onPlayerClick: (id: number) => void }) {
  const bench = lineup.lineupPlayers.filter(p => !p.isStarter)
  if (bench.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Bench</p>
      <div className="space-y-1">
        {bench.map(lp => (
          <button
            key={lp.id}
            onClick={() => onPlayerClick(lp.player.id)}
            className="flex items-center gap-2 py-1 w-full text-left group hover:bg-border/20 rounded px-1 transition-colors"
          >
            <span className="text-xs text-text-muted font-mono w-5 text-right shrink-0">
              {lp.shirtNumber ?? '–'}
            </span>
            <span className={`
              text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0
              ${lp.positionCode === 'G' ? 'bg-yellow-400/15 text-yellow-400' :
                lp.positionCode === 'D' ? 'bg-blue-400/15 text-blue-400'     :
                lp.positionCode === 'M' ? 'bg-green-400/15 text-green-400'   :
                                          'bg-red-400/15 text-red-400'}
            `}>
              {lp.positionCode ?? '?'}
            </span>
            <span className="text-xs text-text-muted group-hover:text-accent truncate transition-colors">
              {playerName(lp.player)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main section component ────────────────────────────────────────────────────

interface LineupsSectionProps {
  homeLineup: Lineup | null
  awayLineup: Lineup | null
  allEvents:  MatchEvent[]
  homeTeam:   Team
  awayTeam:   Team
}

export default function LineupsSection({
  homeLineup,
  awayLineup,
  allEvents,
  homeTeam,
  awayTeam,
}: LineupsSectionProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)

  function openPlayer(id: number) {
    setSelectedPlayerId(id)
  }

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Lineups</h2>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_1fr] gap-6 items-start">

          {/* Home pitch */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              {homeTeam.logoUrl && (
                <img src={homeTeam.logoUrl} alt="" className="w-6 h-6 object-contain" />
              )}
              <span className="font-semibold text-sm text-text-primary">{homeTeam.name}</span>
              {homeLineup?.coach && (
                <span className="text-xs text-text-muted ml-auto">
                  {playerName(homeLineup.coach)}
                </span>
              )}
            </div>
            {homeLineup ? (
              <>
                <FormationPitch
                  formation={homeLineup.formation}
                  players={homeLineup.lineupPlayers}
                  color="#1d4ed8"
                  onPlayerClick={openPlayer}
                />
                <BenchList lineup={homeLineup} onPlayerClick={openPlayer} />
              </>
            ) : (
              <p className="text-text-muted text-xs text-center py-8">No lineup available</p>
            )}
          </div>

          {/* Events timeline */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4 text-center">
              Events
            </p>
            {allEvents.length === 0 ? (
              <p className="text-text-muted text-xs text-center py-8">No events recorded</p>
            ) : (
              <div className="divide-y divide-border/30">
                {allEvents.map(event => (
                  <EventRow
                    key={event.id}
                    event={event}
                    homeTeamId={homeTeam.id}
                    onPlayerClick={openPlayer}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Away pitch */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              {awayTeam.logoUrl && (
                <img src={awayTeam.logoUrl} alt="" className="w-6 h-6 object-contain" />
              )}
              <span className="font-semibold text-sm text-text-primary">{awayTeam.name}</span>
              {awayLineup?.coach && (
                <span className="text-xs text-text-muted ml-auto">
                  {playerName(awayLineup.coach)}
                </span>
              )}
            </div>
            {awayLineup ? (
              <>
                <FormationPitch
                  formation={awayLineup.formation}
                  players={awayLineup.lineupPlayers}
                  color="#dc2626"
                  onPlayerClick={openPlayer}
                />
                <BenchList lineup={awayLineup} onPlayerClick={openPlayer} />
              </>
            ) : (
              <p className="text-text-muted text-xs text-center py-8">No lineup available</p>
            )}
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
