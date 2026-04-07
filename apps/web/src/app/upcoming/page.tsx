import Link from 'next/link'
import { apiFetch, formatDate, formatTime } from '@/lib/api'

export const revalidate = 300

interface Prediction {
  predictedResult: string
  homeWinProb:     number
  drawProb:        number
  awayWinProb:     number
  confidence:      number
  modelVersion:    string
}

interface UpcomingMatch {
  id:          number
  kickoffAt:   string | null
  statusShort: string
  roundLabel:  string | null
  homeTeam: { id: number; name: string; fifaCode: string | null; logoUrl: string | null }
  awayTeam: { id: number; name: string; fifaCode: string | null; logoUrl: string | null }
  competitionSeason: {
    apiFootballSeason: number
    competition: { id: number; name: string; logoUrl: string | null }
  }
  venue:      { name: string; city: string } | null
  prediction: Prediction | null
}

async function getUpcoming(): Promise<UpcomingMatch[]> {
  const data = await apiFetch<UpcomingMatch[]>('/matches/upcoming?limit=123', 300)
  return data ?? []
}

function PredictionBar({ pred }: { pred: Prediction }) {
  const h = Math.round(pred.homeWinProb * 100)
  const d = Math.round(pred.drawProb * 100)
  const a = Math.round(pred.awayWinProb * 100)

  const winnerColor =
    pred.predictedResult === 'HOME' ? 'text-blue-400' :
    pred.predictedResult === 'AWAY' ? 'text-red-400'  :
    'text-text-muted'

  return (
    <div className="mt-3 space-y-1.5">
      {/* Probability bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden">
        <div className="bg-blue-500 transition-all" style={{ width: `${h}%` }} />
        <div className="bg-border/60 transition-all" style={{ width: `${d}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${a}%` }} />
      </div>
      {/* Labels */}
      <div className="flex justify-between text-[10px] font-mono">
        <span className={pred.predictedResult === 'HOME' ? 'text-blue-400 font-bold' : 'text-text-muted'}>{h}%</span>
        <span className={pred.predictedResult === 'DRAW' ? 'text-text-primary font-bold' : 'text-text-muted'}>{d}%</span>
        <span className={pred.predictedResult === 'AWAY' ? 'text-red-400 font-bold' : 'text-text-muted'}>{a}%</span>
      </div>
      <p className={`text-[10px] text-center font-semibold uppercase tracking-wider ${winnerColor}`}>
        {pred.predictedResult === 'HOME' ? 'Home Win' : pred.predictedResult === 'AWAY' ? 'Away Win' : 'Draw'}
        {' '}· {Math.round(pred.confidence * 100)}% conf.
      </p>
    </div>
  )
}

function UpcomingCard({ match }: { match: UpcomingMatch }) {
  return (
    <Link href={`/matches/${match.id}`} className="block group">
      <div className="bg-surface border border-border rounded-xl p-4 hover:border-accent/50 transition-colors h-full">
        {/* Competition + date */}
        <div className="flex justify-between items-start mb-3">
          <span className="text-[10px] text-text-muted uppercase tracking-wider truncate max-w-[60%]">
            {match.competitionSeason.competition.name}
          </span>
          <span className="text-[10px] text-text-muted shrink-0 ml-1">
            {match.kickoffAt ? formatDate(match.kickoffAt) : '—'}
          </span>
        </div>

        {/* Teams + score placeholder */}
        <div className="flex items-center gap-3">
          {/* Home */}
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            {match.homeTeam.logoUrl && (
              <img src={match.homeTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
            )}
            <span className="text-xs font-semibold text-text-primary text-center leading-tight truncate w-full text-center">
              {match.homeTeam.fifaCode ?? match.homeTeam.name}
            </span>
          </div>

          {/* Middle */}
          <div className="flex flex-col items-center shrink-0">
            <span className="text-lg font-black text-text-muted">vs</span>
            <span className="text-[10px] text-text-muted font-mono">
              {match.kickoffAt ? formatTime(match.kickoffAt) : ''}
            </span>
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            {match.awayTeam.logoUrl && (
              <img src={match.awayTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
            )}
            <span className="text-xs font-semibold text-text-primary text-center leading-tight truncate w-full text-center">
              {match.awayTeam.fifaCode ?? match.awayTeam.name}
            </span>
          </div>
        </div>

        {/* ML Prediction */}
        {match.prediction && <PredictionBar pred={match.prediction} />}

        {/* Venue */}
        {match.venue && (
          <p className="text-[10px] text-text-muted text-center mt-2 truncate">
            {match.venue.name}, {match.venue.city}
          </p>
        )}
      </div>
    </Link>
  )
}

export default async function UpcomingPage() {
  const matches = await getUpcoming()

  // Group by month
  const groups = matches.reduce<Record<string, UpcomingMatch[]>>((acc, m) => {
    const key = m.kickoffAt
      ? new Date(m.kickoffAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'TBD'
    if (!acc[key]) acc[key] = []
    acc[key]!.push(m)
    return acc
  }, {})

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-text-primary">Upcoming Matches</h1>
        <p className="text-text-muted mt-1 text-sm">
          {matches.length} fixtures · ML predictions powered by NITBox
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-24 text-text-muted">
          <p className="text-4xl mb-4">📅</p>
          <p>No upcoming matches scheduled.</p>
        </div>
      ) : (
        Object.entries(groups).map(([month, monthMatches]) => (
          <section key={month} className="space-y-4">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest border-b border-border pb-2">
              {month} <span className="text-text-muted/50 font-normal">({monthMatches.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {monthMatches.map(m => <UpcomingCard key={m.id} match={m} />)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
