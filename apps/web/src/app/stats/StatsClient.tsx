'use client'

// =============================================================================
// StatsClient — tabbed stats UI (client component for tab switching).
// =============================================================================

import { useState } from 'react'
import Link         from 'next/link'

interface PlayerRow {
  rank:           number
  goals?:         number
  assists?:       number
  averageRating?: number
  appearances:    number
  player: {
    id:          number
    commonName:  string | null
    firstName:   string
    lastName:    string
    position:    string
    photoUrl:    string | null
    nationality: { name: string; isoAlpha2: string } | null
    squadPlayers: { squad: { team: { id: number; name: string; fifaCode: string; logoUrl: string | null } } }[]
  } | null
}

interface TeamRow {
  rank:           number
  points:         number
  played:         number
  wins:           number
  draws:          number
  losses:         number
  goalsFor:       number
  goalsAgainst:   number
  goalDifference: number
  winRate:        number
  team: { id: number; name: string; fifaCode: string; logoUrl: string | null } | null
}

interface Props {
  scorers: PlayerRow[]
  assists: PlayerRow[]
  ratings: PlayerRow[]
  teams:   TeamRow[]
}

const TABS = [
  { key: 'scorers',  label: 'Goleadores'  },
  { key: 'assists',  label: 'Asistentes'  },
  { key: 'ratings',  label: 'Rating'      },
  { key: 'teams',    label: 'Equipos'     },
] as const

type TabKey = typeof TABS[number]['key']

function playerName(p: PlayerRow['player']) {
  if (!p) return '—'
  return p.commonName ?? `${p.firstName} ${p.lastName}`
}

function flagUrl(isoAlpha2?: string | null) {
  return isoAlpha2 ? `https://flagcdn.com/w20/${isoAlpha2.toLowerCase()}.png` : null
}

function ratingBadge(r: number) {
  const cls = r >= 8 ? 'text-green-400 bg-green-400/10'
            : r >= 7 ? 'text-yellow-400 bg-yellow-400/10'
            :          'text-sky-400 bg-sky-400/10'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${cls}`}>{r.toFixed(2)}</span>
}

// ── Player ranking table ──────────────────────────────────────────────────────

function PlayerTable({ rows, statKey, statLabel }: {
  rows:      PlayerRow[]
  statKey:   'goals' | 'assists' | 'averageRating'
  statLabel: string
}) {
  if (!rows.length) return <Empty />

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-900 text-slate-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3 w-10">#</th>
            <th className="px-4 py-3">Jugador</th>
            <th className="px-4 py-3">Selección</th>
            <th className="px-4 py-3 text-center">PJ</th>
            <th className="px-4 py-3 text-center">{statLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(row => {
            const p    = row.player
            const team = p?.squadPlayers[0]?.squad.team
            const flag = flagUrl(p?.nationality?.isoAlpha2)
            const val  = row[statKey]

            return (
              <tr key={row.rank} className="bg-slate-950 hover:bg-slate-900 transition-colors">
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{row.rank}</td>
                <td className="px-4 py-3">
                  {p ? (
                    <Link href={`/players/${p.id}`} className="flex items-center gap-3 hover:text-sky-400 transition-colors">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-700" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-500">
                          {p.firstName[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-200">{playerName(p)}</p>
                        <p className="text-xs text-slate-500 uppercase">{p.position}</p>
                      </div>
                    </Link>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {flag && <img src={flag} alt="" className="h-3.5 rounded-sm" />}
                    <span className="text-xs text-slate-400">{team?.fifaCode ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-slate-400 tabular-nums">{row.appearances}</td>
                <td className="px-4 py-3 text-center">
                  {statKey === 'averageRating' && val != null
                    ? ratingBadge(val as number)
                    : <span className="font-bold text-slate-200 tabular-nums">{val ?? '—'}</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Team rankings table ───────────────────────────────────────────────────────

function TeamTable({ rows }: { rows: TeamRow[] }) {
  if (!rows.length) return <Empty />

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-900 text-slate-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3 w-10">#</th>
            <th className="px-4 py-3">Equipo</th>
            <th className="px-4 py-3 text-center">PJ</th>
            <th className="px-4 py-3 text-center">G</th>
            <th className="px-4 py-3 text-center">E</th>
            <th className="px-4 py-3 text-center">P</th>
            <th className="px-4 py-3 text-center">GF</th>
            <th className="px-4 py-3 text-center">GC</th>
            <th className="px-4 py-3 text-center">DG</th>
            <th className="px-4 py-3 text-center font-bold text-slate-300">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(row => (
            <tr key={row.rank} className="bg-slate-950 hover:bg-slate-900 transition-colors">
              <td className="px-4 py-3 text-slate-600 font-mono text-xs">{row.rank}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {row.team?.logoUrl && (
                    <img src={row.team.logoUrl} alt="" className="w-7 h-7 object-contain" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-200">{row.team?.name ?? '—'}</p>
                    <p className="text-xs text-slate-500">{row.team?.fifaCode}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-center text-slate-400 tabular-nums">{row.played}</td>
              <td className="px-4 py-3 text-center text-slate-300 tabular-nums">{row.wins}</td>
              <td className="px-4 py-3 text-center text-slate-400 tabular-nums">{row.draws}</td>
              <td className="px-4 py-3 text-center text-slate-500 tabular-nums">{row.losses}</td>
              <td className="px-4 py-3 text-center text-slate-300 tabular-nums">{row.goalsFor}</td>
              <td className="px-4 py-3 text-center text-slate-400 tabular-nums">{row.goalsAgainst}</td>
              <td className={`px-4 py-3 text-center tabular-nums font-medium ${row.goalDifference > 0 ? 'text-green-400' : row.goalDifference < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="px-4 py-3 text-center font-black text-slate-100 tabular-nums">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Empty() {
  return (
    <div className="text-center py-16 text-slate-600">
      <p className="text-4xl mb-3">📊</p>
      <p className="text-sm">Sin datos disponibles aún.</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StatsClient({ scorers, assists, ratings, teams }: Props) {
  const [tab, setTab] = useState<TabKey>('scorers')

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-4xl font-black tracking-tight">Stats & Rankings</h1>
          <p className="text-slate-500 mt-2 text-sm">Fútbol internacional · Copa América, World Cup, Gold Cup y más.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'scorers' && (
          <PlayerTable rows={scorers} statKey="goals"         statLabel="Goles"    />
        )}
        {tab === 'assists' && (
          <PlayerTable rows={assists} statKey="assists"       statLabel="Asistencias" />
        )}
        {tab === 'ratings' && (
          <PlayerTable rows={ratings} statKey="averageRating" statLabel="Rating"   />
        )}
        {tab === 'teams' && (
          <TeamTable rows={teams} />
        )}

      </div>
    </main>
  )
}
