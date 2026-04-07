import { MetadataRoute } from 'next'

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://numbersinthebox.com'

export const revalidate = 86400

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Static pages
  const statics: MetadataRoute.Sitemap = [
    { url: BASE,             lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/stats`,  lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/matches`,lastModified: now, changeFrequency: 'hourly',  priority: 0.8 },
    { url: `${BASE}/upcoming`,lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE}/awards`, lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/live`,   lastModified: now, changeFrequency: 'always',  priority: 0.6 },
  ]

  // Dynamic: recent finished matches
  let matchUrls: MetadataRoute.Sitemap = []
  try {
    const res  = await fetch(`${API}/matches?limit=200&status=FT`, { next: { revalidate: 86400 } })
    const data = res.ok ? await res.json() : []
    matchUrls  = (data as { id: number; kickoffAt?: string }[]).map(m => ({
      url:             `${BASE}/matches/${m.id}`,
      lastModified:    m.kickoffAt ? new Date(m.kickoffAt) : now,
      changeFrequency: 'monthly' as const,
      priority:        0.6,
    }))
  } catch { /* skip on error */ }

  // Dynamic: player pages
  let playerUrls: MetadataRoute.Sitemap = []
  try {
    const res  = await fetch(`${API}/stats/top-scorers?limit=100`, { next: { revalidate: 86400 } })
    const data = res.ok ? await res.json() : []
    const ids  = new Set<number>()
    for (const row of data) if (row.player?.id) ids.add(row.player.id)
    playerUrls = [...ids].map(id => ({
      url:             `${BASE}/players/${id}`,
      lastModified:    now,
      changeFrequency: 'weekly' as const,
      priority:        0.7,
    }))
  } catch { /* skip on error */ }

  return [...statics, ...matchUrls, ...playerUrls]
}
