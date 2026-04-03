// =============================================================================
// Player Profile Page — /players/[id]
// Shows player info + attribute radar card.
// =============================================================================

import PlayerCard, { PlayerRating } from '../../../components/PlayerCard'

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface PlayerProfile {
  id:         number
  commonName: string
  firstName:  string
  lastName:   string
  position:   string
  photoUrl:   string | null
  nationality: { name: string; isoAlpha2: string } | null
  squadPlayers: {
    squad: {
      team: { id: number; name: string; fifaCode: string; logoUrl: string }
    }
  }[]
}

async function fetchPlayer(id: string): Promise<PlayerProfile | null> {
  try {
    const res = await fetch(`${API}/players/${id}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function fetchRating(id: string): Promise<PlayerRating | null> {
  try {
    const res = await fetch(`${API}/players/${id}/rating`, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [player, rating] = await Promise.all([fetchPlayer(id), fetchRating(id)])

  if (!player) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-lg">Player not found.</p>
      </main>
    )
  }

  const countryCode = player.nationality?.isoAlpha2?.toLowerCase()
  const flagUrl = countryCode
    ? `https://flagcdn.com/w40/${countryCode}.png`
    : null

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-12">

        {/* ── Page header ── */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            {flagUrl && (
              <img src={flagUrl} alt={player.nationality?.name} className="h-6 rounded-sm" />
            )}
            <span className="text-sm text-slate-500 font-medium uppercase tracking-widest">
              {player.nationality?.name}
            </span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            {player.commonName}
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            {player.squadPlayers[0]?.squad.team.name ?? 'National Team'}
          </p>
        </div>

        {/* ── Content grid ── */}
        <div className="flex flex-col lg:flex-row gap-10 items-start">

          {/* Player Card with radar */}
          {rating ? (
            <PlayerCard
              rating={rating}
              photoUrl={player.photoUrl}
              nationality={player.nationality?.isoAlpha2?.toUpperCase()}
              flagUrl={flagUrl}
              size="lg"
            />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500 w-72">
              <div className="text-4xl mb-3">⚽</div>
              <p className="text-sm">Ratings not available yet.</p>
              <p className="text-xs mt-1 text-slate-600">
                Run the ML service to generate ratings.
              </p>
            </div>
          )}

          {/* Season stats placeholder */}
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-200 mb-4">Season Statistics</h2>
            <p className="text-slate-500 text-sm">
              Season stats table coming soon.
            </p>
          </div>
        </div>

      </div>
    </main>
  )
}
