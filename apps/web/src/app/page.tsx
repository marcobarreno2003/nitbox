import Link from 'next/link'
import LiveBanner from '@/components/LiveBanner'

// Placeholder data — se reemplaza con fetch al API cuando los seeds esten listos
const recentMatches = [
  { id: 1, homeTeam: 'Argentina', awayTeam: 'Bolivia',  homeScore: 3, awayScore: 0, competition: 'WCQ CONMEBOL', date: 'Mar 25, 2025' },
  { id: 2, homeTeam: 'Brazil',    awayTeam: 'Colombia', homeScore: 1, awayScore: 1, competition: 'WCQ CONMEBOL', date: 'Mar 25, 2025' },
  { id: 3, homeTeam: 'France',    awayTeam: 'Croatia',  homeScore: 2, awayScore: 0, competition: 'WCQ UEFA',     date: 'Mar 24, 2025' },
  { id: 4, homeTeam: 'Spain',     awayTeam: 'Denmark',  homeScore: 3, awayScore: 1, competition: 'WCQ UEFA',     date: 'Mar 24, 2025' },
  { id: 5, homeTeam: 'Morocco',   awayTeam: 'Senegal',  homeScore: 1, awayScore: 0, competition: 'WCQ CAF',      date: 'Mar 23, 2025' },
]

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

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 space-y-24">

      {/* Hero */}
      <section className="space-y-6 max-w-2xl">
        <p className="text-accent text-sm font-semibold tracking-widest uppercase">
          Football Analytics
        </p>
        <h1 className="text-5xl font-bold leading-tight text-text-primary">
          Where the numbers<br />make sense.
        </h1>
        <p className="text-text-muted text-lg leading-relaxed">
          Football analytics for everyone, not just analysts.
          We turn complex data into clear stories about the 60 most important national teams in the world.
        </p>
        <div className="flex items-center gap-8 pt-2">
          <div>
            <span className="text-3xl font-bold text-text-primary">60</span>
            <p className="text-text-muted text-xs mt-0.5">national teams</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <span className="text-3xl font-bold text-text-primary">12</span>
            <p className="text-text-muted text-xs mt-0.5">competitions</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <span className="text-3xl font-bold text-text-primary">4</span>
            <p className="text-text-muted text-xs mt-0.5">seasons</p>
          </div>
        </div>
      </section>

      {/* Live banner — only renders if matches are in progress */}
      <LiveBanner />

      {/* Recent matches */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Recent Matches</h2>
          <Link href="/matches" className="text-sm text-text-muted hover:text-accent transition-colors">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {recentMatches.map((match) => (
            <div
              key={match.id}
              className="bg-surface border border-border rounded-xl p-4 space-y-3 hover:border-accent/40 transition-colors cursor-pointer"
            >
              <p className="text-text-muted text-xs">{match.competition}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary truncate">{match.homeTeam}</span>
                <span className="text-accent font-bold text-sm shrink-0">{match.homeScore}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary truncate">{match.awayTeam}</span>
                <span className="text-text-muted font-bold text-sm shrink-0">{match.awayScore}</span>
              </div>
              <p className="text-text-muted text-xs pt-1 border-t border-border">{match.date}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured stats */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-text-primary">Stats that tell a story</h2>
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
          <h2 className="text-lg font-semibold text-text-primary">From the blog</h2>
          <Link href="/blog" className="text-sm text-text-muted hover:text-accent transition-colors">
            View all
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
              <p className="text-accent text-xs font-medium pt-1">Read more →</p>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
