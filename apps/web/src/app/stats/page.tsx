// =============================================================================
// Stats Page — /stats
// Tabs: Top Scorers | Top Assists | Top Ratings | Team Rankings
// ISR: revalidate every 24h
// =============================================================================

import { Metadata }  from 'next'
import StatsClient   from './StatsClient'

export const revalidate = 86400

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerRow {
  rank:    number
  goals?:  number
  assists?: number
  averageRating?: number
  appearances: number
  player: {
    id: number
    commonName: string | null
    firstName:  string
    lastName:   string
    position:   string
    photoUrl:   string | null
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

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchAll() {
  const opts = { next: { revalidate: 86400 } }
  const [scorers, assists, ratings, teams] = await Promise.all([
    fetch(`${API}/stats/top-scorers?limit=20`,   opts).then(r => r.ok ? r.json() : []),
    fetch(`${API}/stats/top-assists?limit=20`,    opts).then(r => r.ok ? r.json() : []),
    fetch(`${API}/stats/top-ratings?limit=20`,    opts).then(r => r.ok ? r.json() : []),
    fetch(`${API}/stats/team-rankings?limit=20`,  opts).then(r => r.ok ? r.json() : []),
  ])
  return { scorers, assists, ratings, teams }
}

// ── SEO ───────────────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:       'Stats & Rankings — NITBox',
    description: 'Top scorers, assists, ratings and team rankings in international football. Copa América, World Cup, CONCACAF Gold Cup and more.',
    openGraph: {
      title:       'Stats & Rankings — NITBox',
      description: 'International football statistics: top scorers, assists, and team rankings.',
      type:        'website',
    },
  }
}

// ── JSON-LD helpers ───────────────────────────────────────────────────────────

function scorersJsonLd(rows: PlayerRow[]) {
  return {
    '@context':  'https://schema.org',
    '@type':     'ItemList',
    name:        'Top Scorers — International Football',
    itemListElement: rows.slice(0, 10).map((r, i) => ({
      '@type':   'ListItem',
      position:  i + 1,
      name:      r.player ? (r.player.commonName ?? `${r.player.firstName} ${r.player.lastName}`) : 'Unknown',
      url:       r.player ? `/players/${r.player.id}` : undefined,
    })),
  }
}

function teamRankingsJsonLd(rows: TeamRow[]) {
  return {
    '@context':  'https://schema.org',
    '@type':     'ItemList',
    name:        'Team Rankings — International Football',
    itemListElement: rows.slice(0, 10).map((r, i) => ({
      '@type':   'ListItem',
      position:  i + 1,
      name:      r.team?.name ?? 'Unknown',
    })),
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatsPage() {
  const { scorers, assists, ratings, teams } = await fetchAll()

  return (
    <>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(scorersJsonLd(scorers)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(teamRankingsJsonLd(teams)) }}
      />

      <StatsClient
        scorers={scorers}
        assists={assists}
        ratings={ratings}
        teams={teams}
      />
    </>
  )
}
