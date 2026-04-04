import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  apiFetch,
  formatDate,
  formatTime,
  statusLabel,
  isLive,
  playerName,
  type MatchDetail,
  type Lineup,
  type MatchEvent,
} from '@/lib/api'

export const revalidate = 60

// ── Data fetching ──────────────────────────────────────────────────────────

async function getMatch(id: string): Promise<MatchDetail | null> {
  return apiFetch<MatchDetail>(`/matches/${id}`, 60)
}

async function getLineups(id: string): Promise<Lineup[]> {
  const data = await apiFetch<Lineup[]>(`/matches/${id}/lineups`, 3600)
  return data ?? []
}

async function getEvents(id: string): Promise<MatchEvent[]> {
  const data = await apiFetch<MatchEvent[]>(`/matches/${id}/events`, 3600)
  return data ?? []
}

// ── Sub-components ─────────────────────────────────────────────────────────

function EventIcon({ type, detail }: { type: string; detail: string | null }) {
  if (type === 'Goal') {
    if (detail === 'Own Goal') return <span title="Own goal">⚽🔴</span>
    if (detail === 'Penalty')  return <span title="Penalty goal">⚽🎯</span>
    return <span title="Goal">⚽</span>
  }
  if (type === 'Card') {
    if (detail === 'Yellow Card')    return <span title="Yellow card">🟨</span>
    if (detail === 'Red Card')       return <span title="Red card">🟥</span>
    if (detail === 'Yellow Red Card') return <span title="Second yellow">🟨🟥</span>
  }
  if (type === 'subst') return <span title="Substitution">🔄</span>
  return <span>{type[0]}</span>
}

function EventRow({ event, homeTeamId }: { event: MatchEvent; homeTeamId: number }) {
  const isHome = event.team.id === homeTeamId
  const name   = playerName(event.player)
  const assist = event.assistPlayer ? playerName(event.assistPlayer) : null
  const min    = event.minute != null
    ? `${event.minute}${event.extraMinute ? '+' + event.extraMinute : ''}'`
    : '—'

  return (
    <div className={`flex items-center gap-3 py-2 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Minute */}
      <span className="text-text-muted text-xs font-mono w-10 shrink-0 text-center">{min}</span>

      {/* Icon */}
      <span className="text-base shrink-0">
        <EventIcon type={event.type} detail={event.detail} />
      </span>

      {/* Player info */}
      <div className={`flex flex-col min-w-0 ${isHome ? 'items-start' : 'items-end'}`}>
        <span className="text-sm font-medium text-text-primary truncate">{name}</span>
        {assist && (
          <span className="text-xs text-text-muted truncate">+ {assist}</span>
        )}
      </div>
    </div>
  )
}

function LineupGrid({ lineup }: { lineup: Lineup }) {
  const starters = lineup.lineupPlayers.filter(p => p.isStarter)
  const bench    = lineup.lineupPlayers.filter(p => !p.isStarter)

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        {lineup.team.logoUrl && (
          <img src={lineup.team.logoUrl} alt="" className="w-8 h-8 object-contain" />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">{lineup.team.name}</p>
          <p className="text-text-muted text-xs">
            {lineup.formation && <span className="mr-2">{lineup.formation}</span>}
            {lineup.coach && (
              <span>Coach: {playerName(lineup.coach)}</span>
            )}
          </p>
        </div>
      </div>

      {/* Starters */}
      <div className="p-4 space-y-1">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Starting XI</p>
        {starters.map(lp => (
          <div key={lp.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
            <span className="text-xs text-text-muted font-mono w-5 text-right shrink-0">
              {lp.shirtNumber ?? '–'}
            </span>
            <span className={`
              text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0
              ${lp.position === 'G'  ? 'bg-yellow-400/15 text-yellow-400' :
                lp.position === 'D'  ? 'bg-blue-400/15   text-blue-400'   :
                lp.position === 'M'  ? 'bg-green-400/15  text-green-400'  :
                                       'bg-red-400/15    text-red-400'}
            `}>
              {lp.position ?? '?'}
            </span>
            <span className="text-sm text-text-primary truncate">
              {playerName(lp.player)}
            </span>
          </div>
        ))}
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="px-4 pb-4 space-y-1">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 pt-3 border-t border-border">
            Bench
          </p>
          {bench.map(lp => (
            <div key={lp.id} className="flex items-center gap-3 py-1 border-b border-border/30 last:border-0">
              <span className="text-xs text-text-muted font-mono w-5 text-right shrink-0">
                {lp.shirtNumber ?? '–'}
              </span>
              <span className={`
                text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 opacity-60
                ${lp.position === 'G'  ? 'bg-yellow-400/15 text-yellow-400' :
                  lp.position === 'D'  ? 'bg-blue-400/15   text-blue-400'   :
                  lp.position === 'M'  ? 'bg-green-400/15  text-green-400'  :
                                         'bg-red-400/15    text-red-400'}
              `}>
                {lp.position ?? '?'}
              </span>
              <span className="text-sm text-text-muted truncate">
                {playerName(lp.player)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [match, lineups, events] = await Promise.all([
    getMatch(id),
    getLineups(id),
    getEvents(id),
  ])

  if (!match) notFound()

  const live     = isLive(match.statusShort)
  const status   = statusLabel(match)
  const hasScore = match.homeScore !== null && match.awayScore !== null

  const homeLineup = lineups.find(l => l.team.id === match.homeTeam.id)
  const awayLineup = lineups.find(l => l.team.id === match.awayTeam.id)

  const goals = events.filter(e => e.type === 'Goal')
  const cards = events.filter(e => e.type === 'Card')
  const subs  = events.filter(e => e.type === 'subst')
  const allEvents = [...events].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Link href="/matches" className="hover:text-accent transition-colors">Matches</Link>
        <span>/</span>
        <span>{match.homeTeam.fifaCode ?? match.homeTeam.name} vs {match.awayTeam.fifaCode ?? match.awayTeam.name}</span>
      </div>

      {/* Score card */}
      <div className="bg-surface border border-border rounded-2xl p-8">
        {/* Competition */}
        <p className="text-center text-text-muted text-xs mb-6 uppercase tracking-widest">
          {match.competitionSeason.competition.name} · {match.competitionSeason.apiFootballSeason}
        </p>

        {/* Teams + score */}
        <div className="flex items-center justify-between gap-4">
          {/* Home */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {match.homeTeam.logoUrl && (
              <img src={match.homeTeam.logoUrl} alt={match.homeTeam.name} className="w-16 h-16 object-contain" />
            )}
            <span className="text-lg font-bold text-text-primary text-center">
              {match.homeTeam.name}
            </span>
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
                <span className="text-2xl text-text-muted font-light">vs</span>
                <span className="text-4xl font-black text-text-muted">–</span>
              </div>
            )}

            {/* Status badge */}
            <span className={`
              text-sm font-bold px-3 py-1 rounded-full
              ${live
                ? 'bg-green-400/15 text-green-400'
                : 'bg-surface border border-border text-text-muted'}
            `}>
              {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5 align-middle" />}
              {status}
            </span>

            {/* Date / venue */}
            <p className="text-xs text-text-muted text-center mt-1">
              {formatDate(match.kickoffAt)}
              {match.kickoffAt && <span className="ml-1">· {formatTime(match.kickoffAt)}</span>}
            </p>
            {match.venue && (
              <p className="text-xs text-text-muted text-center">
                {match.venue.name}, {match.venue.city}
              </p>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-3 flex-1">
            {match.awayTeam.logoUrl && (
              <img src={match.awayTeam.logoUrl} alt={match.awayTeam.name} className="w-16 h-16 object-contain" />
            )}
            <span className="text-lg font-bold text-text-primary text-center">
              {match.awayTeam.name}
            </span>
            {match.awayTeam.fifaCode && (
              <span className="text-xs text-text-muted font-mono">{match.awayTeam.fifaCode}</span>
            )}
          </div>
        </div>

        {/* Goal scorers summary */}
        {goals.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border flex justify-between gap-8 text-sm">
            {/* Home goals */}
            <div className="space-y-1">
              {goals.filter(e => e.team.id === match.homeTeam.id).map(e => (
                <p key={e.id} className="text-text-muted text-xs">
                  {playerName(e.player)} <span className="text-text-muted font-mono">{e.minute}'</span>
                </p>
              ))}
            </div>
            {/* Away goals */}
            <div className="space-y-1 text-right">
              {goals.filter(e => e.team.id === match.awayTeam.id).map(e => (
                <p key={e.id} className="text-text-muted text-xs">
                  <span className="text-text-muted font-mono">{e.minute}'</span> {playerName(e.player)}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Events timeline + lineups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Lineups — left and right */}
        {homeLineup && <LineupGrid lineup={homeLineup} />}

        {/* Timeline — center column */}
        <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4 text-center">
            Match events
          </p>
          {allEvents.length === 0 ? (
            <p className="text-text-muted text-xs text-center py-8">No events recorded</p>
          ) : (
            <div className="divide-y divide-border/30">
              {allEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  homeTeamId={match.homeTeam.id}
                />
              ))}
            </div>
          )}
        </div>

        {awayLineup && <LineupGrid lineup={awayLineup} />}
      </div>

      {/* Stats summary row */}
      {(goals.length > 0 || cards.length > 0 || subs.length > 0) && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Goals',          value: goals.length,  icon: '⚽' },
            { label: 'Cards',          value: cards.length,  icon: '🟨' },
            { label: 'Substitutions',  value: subs.length,   icon: '🔄' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface border border-border rounded-xl p-4 text-center">
              <p className="text-2xl mb-1">{stat.icon}</p>
              <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
              <p className="text-text-muted text-xs">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
