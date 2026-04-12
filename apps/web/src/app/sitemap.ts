import { MetadataRoute } from 'next'
import { readData, readManifest } from '@/lib/data'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://numbersinthebox.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const manifest = readManifest()

  // Static pages
  const statics: MetadataRoute.Sitemap = [
    { url: BASE,               lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/stats`,    lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/matches`,  lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/upcoming`, lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/awards`,   lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
  ]

  // Dynamic: match pages
  const matchUrls: MetadataRoute.Sitemap = (manifest?.matchIds ?? []).map(id => ({
    url:             `${BASE}/matches/${id}`,
    lastModified:    now,
    changeFrequency: 'monthly' as const,
    priority:        0.6,
  }))

  // Dynamic: player pages
  const playerUrls: MetadataRoute.Sitemap = (manifest?.playerIds ?? []).map(id => ({
    url:             `${BASE}/players/${id}`,
    lastModified:    now,
    changeFrequency: 'monthly' as const,
    priority:        0.7,
  }))

  return [...statics, ...matchUrls, ...playerUrls]
}
