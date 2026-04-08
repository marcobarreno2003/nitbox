import Link from 'next/link'
import LiveBanner from '@/components/LiveBanner'
import { apiFetch, formatDate, statusLabel, type Match } from '@/lib/api'

export const revalidate = 120

async function getRecentMatches(): Promise<Match[]> {
  const data = await apiFetch<Match[]>('/matches?limit=5&status=FT', 120)
  return data ?? []
}

const featuredStats = [
  {
    team: 'Argentina',
    number: '18',
    label: 'unbeaten run',
    sublabel: 'Copa America 2024',
  },
  {
    team: 'France',
    number: '23',
    label: 'matches scoring',
    sublabel: 'at least one goal',
  },
  {
    team: 'Morocco',
    number: '6',
    label: 'clean sheets',
    sublabel: 'in last 8 matches',
  },
]

const latestArticles = [
  {
    slug: 'argentina-no-es-favorita-mundial',
    title: 'Why Argentina is not the favorite to win the World Cup',
    excerpt: 'The numbers tell a different story from the narrative. We break down why the stats do not back Argentina as the clear frontrunner.',
    date: 'Mar 28, 2025',
  },
  {
    slug: 'vinicius-numeros-2024',
    title: "Vinicius Jr.'s 2024 by the numbers",
    excerpt: 'Goals, assists, dribbles, and progressive carries. A complete data portrait of the Brazilian superstar\'s best season yet.',
    date: 'Mar 22, 2025',
  },
  {
    slug: 'marruecos-africa-nueva-potencia',
    title: 'Morocco: the numbers behind Africa\'s new powerhouse',
    excerpt: 'Since the 2022 World Cup semi-final, Morocco\'s data has been consistently elite. Here\'s what the stats say about their rise.',
    date: 'Mar 18, 2025',
  },
]

export default async function HomePage() {
  const recentMatches = await getRecentMatches()
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 space-y-24">

      {/* Hero */}
      <section className="space-y-6 max-w-2xl">
        <p className="text-accent text-sm font-semibold tracking-widest uppercase">
          Mundial 2026
        </p>
        <h1 className="text-5xl font-bold leading-tight text-text-primary">
          La única app que<br />necesitas para el Mundial.
        </h1>
        <p className="text-text-muted text-lg leading-relaxed">
          Resultados en tiempo real, alineaciones, estadísticas y análisis de las
          60 mejores selecciones del mundo. Todo en un solo lugar.
        </p>
        <div className="flex items-center gap-8 pt-2">
          <div>
            <span className="text-3xl font-bold text-text-primary">60</span>
            <p className="text-text-muted text-xs mt-0.5">selecciones</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <span className="text-3xl font-bold text-text-primary">12</span>
            <p className="text-text-muted text-xs mt-0.5">competiciones</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <span className="text-3xl font-bold text-text-primary">4</span>
            <p className="text-text-muted text-xs mt-0.5">temporadas</p>
          </div>
        </div>
      </section>

      {/* Live banner — only renders if matches are in progress */}
      <LiveBanner />

      {/* Recent matches */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Últimos Partidos</h2>
          <Link href="/matches" className="text-sm text-text-muted hover:text-accent transition-colors">
            Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {recentMatches.length === 0 ? (
            <p className="text-text-muted text-sm col-span-5">No se encontraron partidos recientes.</p>
          ) : recentMatches.map((match) => (
            <Link
              key={match.id}
              href={`/matches/${match.id}`}
              className="bg-surface border border-border rounded-xl p-4 space-y-3 hover:border-accent/40 transition-colors block"
            >
              <p className="text-text-muted text-xs truncate">
                {match.competitionSeason.competition.name}
              </p>
              {(() => {
                const hs = match.homeScore
                const as_ = match.awayScore
                const hasScore = hs !== null && as_ !== null
                const homeWin = hasScore && hs! > as_!
                const awayWin = hasScore && as_! > hs!
                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {match.homeTeam.logoUrl && (
                          <img src={match.homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
                        )}
                        <span className={`text-sm font-semibold truncate ${homeWin ? 'text-text-primary' : 'text-text-muted'}`}>
                          {match.homeTeam.fifaCode ?? match.homeTeam.name}
                        </span>
                      </div>
                      <span className={`text-sm shrink-0 tabular-nums ${homeWin ? 'text-text-primary font-black' : 'text-text-muted font-bold'}`}>
                        {hasScore ? hs : '–'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {match.awayTeam.logoUrl && (
                          <img src={match.awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
                        )}
                        <span className={`text-sm font-semibold truncate ${awayWin ? 'text-text-primary' : 'text-text-muted'}`}>
                          {match.awayTeam.fifaCode ?? match.awayTeam.name}
                        </span>
                      </div>
                      <span className={`text-sm shrink-0 tabular-nums ${awayWin ? 'text-text-primary font-black' : 'text-text-muted font-bold'}`}>
                        {hasScore ? as_ : '–'}
                      </span>
                    </div>
                  </>
                )
              })()}
              <p className="text-text-muted text-xs pt-1 border-t border-border">
                {formatDate(match.kickoffAt)} · {statusLabel(match)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured stats */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-text-primary">Números que cuentan historias</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {featuredStats.map((stat) => (
            <div
              key={stat.team}
              className="bg-surface border border-border rounded-xl p-6 space-y-2 hover:border-accent/40 transition-colors"
            >
              <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{stat.team}</p>
              <p className="text-5xl font-bold text-text-primary">{stat.number}</p>
              <p className="text-text-primary text-sm font-medium">{stat.label}</p>
              <p className="text-text-muted text-xs">{stat.sublabel}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Latest articles */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Del blog</h2>
          <Link href="/blog" className="text-sm text-text-muted hover:text-accent transition-colors">
            Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {latestArticles.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="bg-surface border border-border rounded-xl p-6 space-y-3 hover:border-accent/40 transition-colors block"
            >
              <p className="text-text-muted text-xs">{article.date}</p>
              <h3 className="text-text-primary font-semibold text-base leading-snug">{article.title}</h3>
              <p className="text-text-muted text-sm leading-relaxed line-clamp-3">{article.excerpt}</p>
              <p className="text-accent text-xs font-medium pt-1">Leer más →</p>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
