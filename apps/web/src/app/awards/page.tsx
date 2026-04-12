// =============================================================================
// Awards Page — /awards
// Showcases NITBox awards: PLAYER_OF_MATCH, PLAYER_OF_SEASON, BEST_DEFENSIVE.
// =============================================================================

import NitboxCard from '../../components/NitboxCard'
import { readData } from '@/lib/data'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AwardPlayer {
  id:          number
  commonName:  string | null
  firstName:   string
  lastName:    string
  position:    string
  photoUrl:    string | null
  nationality: { name: string; isoAlpha2: string } | null
}

interface Award {
  id:         number
  type:       'PLAYER_OF_MATCH' | 'PLAYER_OF_SEASON' | 'PLAYER_OF_CUP' | 'BEST_DEFENSIVE'
  seasonYear: number
  score:      number
  player:     AwardPlayer
  match?: {
    id:        number
    kickoffAt: string
    homeScore: number | null
    awayScore: number | null
    homeTeam:  { id: number; name: string; fifaCode: string; logoUrl: string | null }
    awayTeam:  { id: number; name: string; fifaCode: string; logoUrl: string | null }
  } | null
  competitionSeason?: {
    apiFootballSeason: number
    competition: { id: number; name: string; shortName: string; logoUrl: string | null }
  } | null
}

// ── Components ────────────────────────────────────────────────────────────────

const AWARD_META = {
  PLAYER_OF_MATCH:  { label: 'Man of the Match', icon: '⭐', tier: 'gold'   as const },
  PLAYER_OF_SEASON: { label: 'Player of the Season', icon: '🏆', tier: 'purple' as const },
  BEST_DEFENSIVE:   { label: 'Best Defensive Player', icon: '🛡️', tier: 'teal'   as const },
}

function AwardCard({ award, rating }: { award: Award; rating: any | null }) {
  const player     = award.player
  const name       = player.commonName ?? `${player.firstName} ${player.lastName}`
  const countryCode = player.nationality?.isoAlpha2?.toLowerCase()
  const flagUrl    = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : null
  const meta       = AWARD_META[award.type] ?? { label: award.type, icon: '🏅', tier: 'silver' as const }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Award badge */}
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700">
        <span>{meta.icon}</span>
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{meta.label}</span>
        {award.competitionSeason && (
          <span className="text-xs text-slate-500">
            · {award.competitionSeason.competition.shortName} {award.seasonYear}
          </span>
        )}
      </div>

      {/* Match context for PLAYER_OF_MATCH */}
      {award.type === 'PLAYER_OF_MATCH' && award.match && (
        <a href={`/matches/${award.match.id}`} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          {award.match.homeTeam.fifaCode} {award.match.homeScore}–{award.match.awayScore} {award.match.awayTeam.fifaCode}
          · {new Date(award.match.kickoffAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
        </a>
      )}

      {/* Card */}
      {rating ? (
        <a href={`/players/${player.id}`}>
          <NitboxCard
            rating={rating}
            photoUrl={player.photoUrl}
            flagUrl={flagUrl}
            nationality={player.nationality?.isoAlpha2?.toUpperCase()}
            tier={meta.tier}
          />
        </a>
      ) : (
        <a href={`/players/${player.id}`} className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-slate-800 bg-slate-900 w-[240px] hover:border-slate-600 transition-colors">
          {player.photoUrl && (
            <img src={player.photoUrl} alt={name} className="w-20 h-20 rounded-full object-cover border-2 border-slate-700" />
          )}
          {flagUrl && <img src={flagUrl} alt="" className="h-4 rounded-sm" />}
          <p className="text-base font-bold text-slate-200 text-center">{name}</p>
          <p className="text-xs text-slate-500 uppercase">{player.position}</p>
        </a>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────��───────────────────────────────────────

export default function AwardsPage() {
  const potmAwards = readData<Award[]>('awards/player-of-match.json') ?? []
  const potsAwards = readData<Award[]>('awards/player-of-season.json') ?? []
  const bdAwards   = readData<Award[]>('awards/best-defensive.json') ?? []
  const ratingsMap = readData<Record<number, any>>('awards/ratings.json') ?? {}

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-16">

        {/* Header */}
        <div>
          <h1 className="text-4xl font-black tracking-tight">NITBox Awards</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Reconocimientos calculados a partir de estadísticas de partidos internacionales.
          </p>
        </div>

        {/* Player of the Season */}
        {potsAwards.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-300 mb-8 flex items-center gap-2">
              🏆 <span>Player of the Season</span>
            </h2>
            <div className="flex flex-wrap gap-8 justify-start">
              {potsAwards.map(award => (
                <AwardCard key={award.id} award={award} rating={ratingsMap[award.player.id] ?? null} />
              ))}
            </div>
          </section>
        )}

        {/* Best Defensive */}
        {bdAwards.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-300 mb-8 flex items-center gap-2">
              🛡️ <span>Best Defensive Player</span>
            </h2>
            <div className="flex flex-wrap gap-8 justify-start">
              {bdAwards.map(award => (
                <AwardCard key={award.id} award={award} rating={ratingsMap[award.player.id] ?? null} />
              ))}
            </div>
          </section>
        )}

        {/* Man of the Match */}
        {potmAwards.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-300 mb-8 flex items-center gap-2">
              ⭐ <span>Man of the Match</span>
            </h2>
            <div className="flex flex-wrap gap-8 justify-start">
              {potmAwards.map(award => (
                <AwardCard key={award.id} award={award} rating={ratingsMap[award.player.id] ?? null} />
              ))}
            </div>
          </section>
        )}

        {potsAwards.length === 0 && bdAwards.length === 0 && potmAwards.length === 0 && (
          <div className="text-center py-24 text-slate-600">
            <p className="text-5xl mb-4">🏅</p>
            <p className="text-lg font-semibold">Sin premios calculados aún</p>
            <p className="text-sm mt-2">Los premios se calculan automáticamente al enriquecer los partidos.</p>
          </div>
        )}

      </div>
    </main>
  )
}
