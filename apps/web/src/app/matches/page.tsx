import { apiFetch, isLive, type Match } from '@/lib/api'
import MatchCard from '@/components/MatchCard'
import MatchesSearch from '@/components/MatchesSearch'

export const revalidate = 120

async function getMatches(): Promise<Match[]> {
  const data = await apiFetch<Match[]>('/matches?limit=80', 120)
  return data ?? []
}

export default async function MatchesPage() {
  const matches = await getMatches()

  const live     = matches.filter(m => isLive(m.statusShort))
  const finished = matches.filter(m => ['FT', 'AET', 'PEN'].includes(m.statusShort))
  const upcoming = matches.filter(m => m.statusShort === 'NS')

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-text-primary">Matches</h1>
        <p className="text-text-muted mt-1 text-sm">National team results across all competitions</p>
      </div>

      {/* ── Search ── */}
      <MatchesSearch />

      {/* ── Live ── */}
      {live.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-green-400 uppercase tracking-widest">Live now</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {live.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* ── Recent results ── */}
      {finished.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Recent results</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {finished.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* ── Upcoming ── */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Upcoming</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {upcoming.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {matches.length === 0 && (
        <div className="text-center py-24 text-text-muted">
          <p className="text-4xl mb-4">⚽</p>
          <p>No matches found.</p>
        </div>
      )}

    </div>
  )
}
