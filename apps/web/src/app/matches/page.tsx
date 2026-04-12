import { type Match } from '@/lib/api'
import { readData } from '@/lib/data'
import MatchCard from '@/components/MatchCard'
import MatchesSearch from '@/components/MatchesSearch'

export default function MatchesPage() {
  const results = readData<Match[]>('matches-results.json') ?? []

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-text-primary">Results</h1>
        <p className="text-text-muted mt-1 text-sm">Recent national team results across all competitions</p>
      </div>

      {/* Search (client-side filtering) */}
      <MatchesSearch matches={results} />

      {/* Recent results */}
      {results.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Recent results</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {results.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {results.length === 0 && (
        <div className="text-center py-24 text-text-muted">
          <p className="text-4xl mb-4">⚽</p>
          <p>No results found.</p>
        </div>
      )}

    </div>
  )
}
