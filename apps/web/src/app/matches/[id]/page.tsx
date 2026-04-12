import Link from 'next/link'
import { notFound } from 'next/navigation'
import LineupsSection from '@/components/LineupsSection'
import MatchStatsPanel from '@/components/MatchStatsPanel'
import PlayerPerformanceTable from '@/components/PlayerPerformanceTable'
import { readData, readManifest } from '@/lib/data'
import {
  formatDate,
  formatTime,
  statusLabel,
  isLive,
  playerName,
  type MatchDetail,
  type Lineup,
  type MatchEvent,
  type PlayerStat,
} from '@/lib/api'

// ── Static params for all matches ────────────────────────────────────────────

export function generateStaticParams() {
  const manifest = readManifest()
  return (manifest?.matchIds ?? []).map(id => ({ id: String(id) }))
}

// ── Page ────────────────────────────────────────────────────────────────────

interface MatchData {
  match: MatchDetail | null
  lineups: Lineup[]
  events: MatchEvent[]
  players: PlayerStat[]
}

export default function MatchPage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const data = readData<MatchData>(`matches/${id}.json`)

  if (!data?.match) notFound()

  const match = data.match
  const lineups = data.lineups ?? []
  const events = data.events ?? []
  const playerStats = data.players ?? []

  const live     = isLive(match.statusShort)
  const status   = statusLabel(match)
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const isFinished = ['FT', 'AET', 'PEN'].includes(match.statusShort)

  const homeLineup = lineups.find(l => l.team.id === match.homeTeam.id) ?? null
  const awayLineup = lineups.find(l => l.team.id === match.awayTeam.id) ?? null

  const goals     = events.filter(e => e.type === 'Goal')
  const allEvents = [...events].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Link href="/matches" className="hover:text-accent transition-colors">Partidos</Link>
        <span>/</span>
        <span>{match.homeTeam.fifaCode ?? match.homeTeam.name} vs {match.awayTeam.fifaCode ?? match.awayTeam.name}</span>
      </div>

      {/* Score card */}
      <div className="bg-surface border border-border rounded-2xl p-8">
        <p className="text-center text-text-muted text-xs mb-6 uppercase tracking-widest">
          {match.competitionSeason.competition.name} · {match.competitionSeason.apiFootballSeason}
        </p>

        <div className="flex items-center justify-between gap-4">
          {/* Home team */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {match.homeTeam.logoUrl && (
              <img src={match.homeTeam.logoUrl} alt={match.homeTeam.name} className="w-16 h-16 object-contain" />
            )}
            <span className="text-lg font-bold text-text-primary text-center">{match.homeTeam.name}</span>
            {match.homeTeam.fifaCode && (
              <span className="text-xs text-text-muted font-mono">{match.homeTeam.fifaCode}</span>
            )}
          </div>

          {/* Score */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            {hasScore ? (
              <div className="flex items-center gap-3">
                <span className="text-6xl font-black text-text-primary tabular-nums">{match.homeScore}</span>
                <span className="text-3xl text-text-muted font-light">–</span>
                <span className="text-6xl font-black text-text-primary tabular-nums">{match.awayScore}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black text-text-muted">–</span>
                <span className="text-2xl text-text-muted">vs</span>
                <span className="text-4xl font-black text-text-muted">–</span>
              </div>
            )}

            <span className="text-sm font-bold px-3 py-1 rounded-full bg-surface border border-border text-text-muted">
              {status}
            </span>

            <p className="text-xs text-text-muted text-center mt-1">
              {formatDate(match.kickoffAt)}
              {match.kickoffAt && <span className="ml-1">· {formatTime(match.kickoffAt)}</span>}
            </p>
            {match.venue && (
              <p className="text-xs text-text-muted text-center">{match.venue.name}, {match.venue.city}</p>
            )}
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {match.awayTeam.logoUrl && (
              <img src={match.awayTeam.logoUrl} alt={match.awayTeam.name} className="w-16 h-16 object-contain" />
            )}
            <span className="text-lg font-bold text-text-primary text-center">{match.awayTeam.name}</span>
            {match.awayTeam.fifaCode && (
              <span className="text-xs text-text-muted font-mono">{match.awayTeam.fifaCode}</span>
            )}
          </div>
        </div>

        {/* Goal scorers */}
        {goals.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border flex justify-between gap-8">
            <div className="space-y-1">
              {goals.filter(e => e.team.id === match.homeTeam.id).map(e => (
                <p key={e.id} className="text-text-muted text-xs">
                  ⚽ {playerName(e.player)} <span className="font-mono">{e.minute}'</span>
                </p>
              ))}
            </div>
            <div className="space-y-1 text-right">
              {goals.filter(e => e.team.id === match.awayTeam.id).map(e => (
                <p key={e.id} className="text-text-muted text-xs">
                  <span className="font-mono">{e.minute}'</span> {playerName(e.player)} ⚽
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lineups + Events */}
      {(homeLineup || awayLineup || allEvents.length > 0) && (
        <LineupsSection
          homeLineup={homeLineup}
          awayLineup={awayLineup}
          allEvents={allEvents}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
        />
      )}

      {/* Match Stats */}
      {isFinished && match.teamStatistics.length > 0 && (
        <MatchStatsPanel
          homeTeamName={match.homeTeam.name}
          awayTeamName={match.awayTeam.name}
          stats={match.teamStatistics}
        />
      )}

      {/* Player Performance */}
      {isFinished && playerStats.length > 0 && (
        <PlayerPerformanceTable
          playerStats={playerStats}
          homeTeamId={match.homeTeam.id}
          awayTeamId={match.awayTeam.id}
          homeTeamName={match.homeTeam.name}
          awayTeamName={match.awayTeam.name}
        />
      )}

    </div>
  )
}
