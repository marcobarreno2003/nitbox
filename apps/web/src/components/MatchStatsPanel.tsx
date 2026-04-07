'use client'

// =============================================================================
// MatchStatsPanel — horizontal bar comparison for two teams' match statistics.
// Shows possession, shots, passing accuracy, corners, fouls, etc.
// =============================================================================

interface TeamStats {
  isHome:           boolean
  possessionPct:    number | null
  shots:            number | null
  shotsOnTarget:    number | null
  passAccuracyPct:  number | null
  corners:          number | null
  fouls:            number | null
  yellowCards:      number | null
  offsides:         number | null
  saves:            number | null
}

interface MatchStatsPanelProps {
  homeTeamName: string
  awayTeamName: string
  stats:        TeamStats[]
}

function StatRow({
  label,
  homeVal,
  awayVal,
  isPercent = false,
}: {
  label:      string
  homeVal:    number | null
  awayVal:    number | null
  isPercent?: boolean
}) {
  const h = homeVal ?? 0
  const a = awayVal ?? 0
  const total = h + a
  const homePct = total === 0 ? 50 : (h / total) * 100
  const awayPct = 100 - homePct

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-blue-400 tabular-nums">{homeVal ?? '—'}{isPercent ? '%' : ''}</span>
        <span className="text-text-muted text-center flex-1 mx-2">{label}</span>
        <span className="font-semibold text-red-400 tabular-nums">{awayVal ?? '—'}{isPercent ? '%' : ''}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-border/30">
        <div
          className="bg-blue-500 transition-all duration-500 rounded-l-full"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-500 rounded-r-full"
          style={{ width: `${awayPct}%` }}
        />
      </div>
    </div>
  )
}

export default function MatchStatsPanel({ homeTeamName, awayTeamName, stats }: MatchStatsPanelProps) {
  const home = stats.find(s => s.isHome)
  const away = stats.find(s => !s.isHome)

  if (!home && !away) return null

  const rows: { label: string; hVal: number | null; aVal: number | null; isPct?: boolean }[] = [
    { label: 'Possession',      hVal: home?.possessionPct   ?? null, aVal: away?.possessionPct   ?? null, isPct: true },
    { label: 'Shots',           hVal: home?.shots            ?? null, aVal: away?.shots            ?? null },
    { label: 'Shots on Target', hVal: home?.shotsOnTarget    ?? null, aVal: away?.shotsOnTarget    ?? null },
    { label: 'Pass Accuracy',   hVal: home?.passAccuracyPct  ?? null, aVal: away?.passAccuracyPct  ?? null, isPct: true },
    { label: 'Corners',         hVal: home?.corners           ?? null, aVal: away?.corners           ?? null },
    { label: 'Fouls',           hVal: home?.fouls             ?? null, aVal: away?.fouls             ?? null },
    { label: 'Yellow Cards',    hVal: home?.yellowCards       ?? null, aVal: away?.yellowCards       ?? null },
    { label: 'Offsides',        hVal: home?.offsides          ?? null, aVal: away?.offsides          ?? null },
    { label: 'Saves',           hVal: home?.saves             ?? null, aVal: away?.saves             ?? null },
  ].filter(r => r.hVal !== null || r.aVal !== null)

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Match Stats</h2>
      <div className="bg-surface border border-border rounded-xl p-6">
        {/* Header */}
        <div className="flex justify-between mb-5 text-sm font-semibold">
          <span className="text-blue-400">{homeTeamName}</span>
          <span className="text-red-400">{awayTeamName}</span>
        </div>
        <div className="space-y-4">
          {rows.map(r => (
            <StatRow
              key={r.label}
              label={r.label}
              homeVal={r.hVal}
              awayVal={r.aVal}
              isPercent={r.isPct}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
