// =============================================================================
// Player Profile Page — /players/[id]
// Shows player card, last 5 match ratings chart, trophies, season stats table.
// =============================================================================

import PlayerCard, { PlayerRating } from '../../../components/PlayerCard'
import RatingHistoryChart from '../../../components/RatingHistoryChart'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface Team { id: number; name: string; fifaCode: string; logoUrl: string | null }
interface Competition { id: number; name: string; shortName: string }

interface RecentMatchStat {
  matchId: number
  rating:  number | null
  goals:   number
  assists: number
  minutesPlayed: number | null
  match: {
    id:          number
    kickoffAt:   string
    homeScore:   number | null
    awayScore:   number | null
    statusShort: string
    homeTeam:    Team
    awayTeam:    Team
    competitionSeason: { competition: Competition }
  }
}

interface Award {
  id:         number
  type:       'PLAYER_OF_MATCH' | 'PLAYER_OF_SEASON' | 'PLAYER_OF_CUP' | 'BEST_DEFENSIVE'
  seasonYear: number
  score:      number
  match?: { id: number; kickoffAt: string; homeTeam: { name: string; fifaCode: string }; awayTeam: { name: string; fifaCode: string } } | null
  competitionSeason?: { competition: Competition } | null
}

interface SeasonStats {
  id:               number
  appearances:      number
  starts:           number
  minutesPlayed:    number
  goals:            number
  assists:          number
  yellowCards:      number
  redCards:         number
  averageRating:    number | null
  team:             Team
  competitionSeason: { apiFootballSeason: number; competition: Competition }
}

interface PlayerProfile {
  id:            number
  commonName:    string | null
  firstName:     string
  lastName:      string
  position:      string
  photoUrl:      string | null
  dateOfBirth:   string | null
  heightCm:      number | null
  weightKg:      number | null
  nationality:   { name: string; isoAlpha2: string } | null
  birthCountry:  { name: string } | null
  squadPlayers:  { squad: { team: Team } }[]
  playerMatchStats: RecentMatchStat[]
  nitboxAwards:  Award[]
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchPlayer(id: string): Promise<PlayerProfile | null> {
  try {
    const res = await fetch(`${API}/players/${id}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function fetchRating(id: string): Promise<PlayerRating | null> {
  try {
    const res = await fetch(`${API}/players/${id}/rating`, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function fetchStats(id: string): Promise<SeasonStats[]> {
  try {
    const res = await fetch(`${API}/players/${id}/stats`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const AWARD_LABEL: Record<string, string> = {
  PLAYER_OF_MATCH:  'Man of the Match',
  PLAYER_OF_SEASON: 'Player of the Season',
  PLAYER_OF_CUP:    'Player of the Cup',
  BEST_DEFENSIVE:   'Best Defensive Player',
}

const AWARD_COLOR: Record<string, string> = {
  PLAYER_OF_MATCH:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  PLAYER_OF_SEASON: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  PLAYER_OF_CUP:    'text-sky-400    bg-sky-400/10    border-sky-400/20',
  BEST_DEFENSIVE:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
}

function ratingColor(r: number) {
  if (r >= 8.0) return 'text-green-400 bg-green-400/10'
  if (r >= 7.0) return 'text-yellow-400 bg-yellow-400/10'
  if (r >= 6.0) return 'text-sky-400 bg-sky-400/10'
  return 'text-slate-400 bg-slate-500/10'
}

function age(dob: string | null) {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [player, rating, seasonStats] = await Promise.all([
    fetchPlayer(id),
    fetchRating(id),
    fetchStats(id),
  ])

  if (!player) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-lg">Player not found.</p>
      </main>
    )
  }

  const displayName  = player.commonName ?? `${player.firstName} ${player.lastName}`
  const countryCode  = player.nationality?.isoAlpha2?.toLowerCase()
  const flagUrl      = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : null
  const currentTeam  = player.squadPlayers[0]?.squad.team ?? null
  const playerAge    = age(player.dateOfBirth)

  // Rating history from last 5 match stats
  const ratingHistory = player.playerMatchStats
    .filter(s => s.rating != null)
    .map(s => ({
      label:  new Date(s.match.kickoffAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      rating: s.rating!,
      vs:     s.match.homeTeam.id === currentTeam?.id
                ? s.match.awayTeam.fifaCode
                : s.match.homeTeam.fifaCode,
    }))
    .reverse()

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            {flagUrl && <img src={flagUrl} alt={player.nationality?.name} className="h-6 rounded-sm" />}
            <span className="text-sm text-slate-500 font-medium uppercase tracking-widest">
              {player.nationality?.name}
            </span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">{displayName}</h1>
          <div className="flex items-center gap-4 mt-2 text-slate-400 text-sm">
            {currentTeam && <span>{currentTeam.name}</span>}
            {playerAge   && <span>{playerAge} years</span>}
            {player.heightCm && <span>{player.heightCm} cm</span>}
            {player.weightKg && <span>{player.weightKg} kg</span>}
            <span className="uppercase font-semibold text-slate-300">{player.position}</span>
          </div>
        </div>

        {/* ── Main layout ── */}
        <div className="flex flex-col lg:flex-row gap-10 items-start">

          {/* Left: Card */}
          {rating ? (
            <div className="shrink-0">
              <PlayerCard
                rating={rating}
                photoUrl={player.photoUrl}
                nationality={player.nationality?.isoAlpha2?.toUpperCase()}
                flagUrl={flagUrl}
                size="lg"
              />
            </div>
          ) : (
            <div className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500 w-72">
              <p className="text-4xl mb-3">⚽</p>
              <p className="text-sm">Sin datos suficientes para calcular el perfil</p>
            </div>
          )}

          {/* Right: Rating history + Awards */}
          <div className="flex-1 space-y-8">

            {/* Rating history chart */}
            {ratingHistory.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-slate-300 mb-4 uppercase tracking-widest">
                  Rating — últimos partidos
                </h2>
                <RatingHistoryChart data={ratingHistory} />
              </section>
            )}

            {/* Awards */}
            {player.nitboxAwards.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-slate-300 mb-4 uppercase tracking-widest">
                  Trofeos NITBox
                </h2>
                <div className="flex flex-wrap gap-2">
                  {player.nitboxAwards.map(a => (
                    <div
                      key={a.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${AWARD_COLOR[a.type] ?? 'text-slate-400 bg-slate-800 border-slate-700'}`}
                    >
                      <span>🏆</span>
                      <span>{AWARD_LABEL[a.type] ?? a.type}</span>
                      {a.competitionSeason && (
                        <span className="opacity-60">· {a.competitionSeason.competition.shortName} {a.seasonYear}</span>
                      )}
                      {a.type === 'PLAYER_OF_MATCH' && a.match && (
                        <span className="opacity-60">
                          · {a.match.homeTeam.fifaCode} vs {a.match.awayTeam.fifaCode}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Last 5 matches */}
            {player.playerMatchStats.length > 0 && (
              <section>
                <h2 className="text-base font-bold text-slate-300 mb-4 uppercase tracking-widest">
                  Últimos partidos
                </h2>
                <div className="space-y-2">
                  {player.playerMatchStats.map(s => {
                    const m        = s.match
                    const isHome   = m.homeTeam.id === currentTeam?.id
                    const opponent = isHome ? m.awayTeam : m.homeTeam
                    const score    = m.homeScore != null ? `${m.homeScore}–${m.awayScore}` : '–'
                    return (
                      <a
                        key={s.matchId}
                        href={`/matches/${m.id}`}
                        className="flex items-center gap-4 p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors"
                      >
                        {opponent.logoUrl && (
                          <img src={opponent.logoUrl} alt={opponent.name} className="w-8 h-8 object-contain" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-200">
                            {isHome ? 'vs' : '@'} {opponent.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {m.competitionSeason.competition.shortName} ·{' '}
                            {new Date(m.kickoffAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="text-sm font-bold text-slate-300 tabular-nums">{score}</div>
                        {s.rating != null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${ratingColor(s.rating)}`}>
                            {s.rating.toFixed(1)}
                          </span>
                        )}
                        {s.goals > 0 && <span className="text-xs text-slate-400">⚽ {s.goals}</span>}
                        {s.assists > 0 && <span className="text-xs text-slate-400">🅰️ {s.assists}</span>}
                        {s.minutesPlayed != null && (
                          <span className="text-xs text-slate-600">{s.minutesPlayed}'</span>
                        )}
                      </a>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* ── Season stats table ── */}
        {seasonStats.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-300 mb-4 uppercase tracking-widest">
              Historial por competición
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-900 text-slate-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Competición</th>
                    <th className="px-4 py-3 text-center">Temp.</th>
                    <th className="px-4 py-3 text-center">PJ</th>
                    <th className="px-4 py-3 text-center">Min</th>
                    <th className="px-4 py-3 text-center">Goles</th>
                    <th className="px-4 py-3 text-center">Asist.</th>
                    <th className="px-4 py-3 text-center">TA</th>
                    <th className="px-4 py-3 text-center">TR</th>
                    <th className="px-4 py-3 text-center">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {seasonStats.map(s => (
                    <tr key={s.id} className="bg-slate-950 hover:bg-slate-900 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {s.competitionSeason.competition.shortName}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">
                        {s.competitionSeason.apiFootballSeason}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">{s.appearances}</td>
                      <td className="px-4 py-3 text-center text-slate-400">{s.minutesPlayed}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-200">{s.goals}</td>
                      <td className="px-4 py-3 text-center text-slate-300">{s.assists}</td>
                      <td className="px-4 py-3 text-center text-yellow-400">{s.yellowCards}</td>
                      <td className="px-4 py-3 text-center text-red-400">{s.redCards}</td>
                      <td className="px-4 py-3 text-center">
                        {s.averageRating != null ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${ratingColor(s.averageRating)}`}>
                            {s.averageRating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
