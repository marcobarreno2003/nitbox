/**
 * export-static.ts — One-time export of API data to static JSON files.
 *
 * Prerequisites:
 *   1. API running on localhost:3001 (npm run dev in apps/api)
 *   2. ML service running on localhost:8000 (for player ratings)
 *   3. Database seeded with data
 *
 * Usage:
 *   npx ts-node scripts/export-static.ts
 *
 * Output:
 *   apps/web/data/  — static JSON files consumed by the Next.js static build
 */

import * as fs from 'fs'
import * as path from 'path'

const API = process.env.API_URL ?? 'http://localhost:3001/api'
const OUT = path.resolve(__dirname, '..', 'apps', 'web', 'data')

// Concurrency control
const CONCURRENCY = 5
const DELAY_MS = 50

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const text = await res.text()
    if (!text) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

function writeJson(filePath: string, data: unknown): void {
  const full = path.join(OUT, filePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, JSON.stringify(data), 'utf-8')
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + concurrency < items.length) await sleep(DELAY_MS)
  }
  return results
}

// ── Export functions ─────────────────────────────────────────────────────────

async function exportMatchesLists(): Promise<{ resultIds: number[]; upcomingIds: number[] }> {
  console.log('Exporting match lists...')

  // Recent matches for home page
  const recent = await fetchJson<any[]>(`${API}/matches?limit=20&status=FT`)
  writeJson('matches-recent.json', recent ?? [])

  // All finished matches for results page
  const results = await fetchJson<any[]>(`${API}/matches?limit=9999&status=FT`)
  writeJson('matches-results.json', results ?? [])

  // Upcoming matches (strip predictions for portfolio)
  const upcoming = await fetchJson<any[]>(`${API}/matches/upcoming?limit=9999`)
  const upcomingClean = (upcoming ?? []).map(m => ({ ...m, prediction: null }))
  writeJson('matches-upcoming.json', upcomingClean)

  const resultIds = (results ?? []).map((m: any) => m.id)
  const upcomingIds = (upcoming ?? []).map((m: any) => m.id)

  console.log(`  ${resultIds.length} finished, ${upcomingIds.length} upcoming`)
  return { resultIds, upcomingIds }
}

async function exportMatchDetail(matchId: number): Promise<number[]> {
  const [detail, lineups, events, players] = await Promise.all([
    fetchJson<any>(`${API}/matches/${matchId}`),
    fetchJson<any[]>(`${API}/matches/${matchId}/lineups`),
    fetchJson<any[]>(`${API}/matches/${matchId}/events`),
    fetchJson<any[]>(`${API}/matches/${matchId}/players`),
  ])

  writeJson(`matches/${matchId}.json`, {
    match: detail,
    lineups: lineups ?? [],
    events: events ?? [],
    players: players ?? [],
  })

  // Collect player IDs from player stats
  return (players ?? []).map((p: any) => p.player?.id).filter(Boolean)
}

async function exportAllMatchDetails(matchIds: number[]): Promise<Set<number>> {
  console.log(`Exporting ${matchIds.length} match details...`)

  const allPlayerIds = new Set<number>()
  let done = 0

  await processInBatches(matchIds, async (id) => {
    const playerIds = await exportMatchDetail(id)
    playerIds.forEach(pid => allPlayerIds.add(pid))
    done++
    if (done % 50 === 0) console.log(`  ${done}/${matchIds.length} matches`)
    return id
  }, CONCURRENCY)

  console.log(`  Done. Found ${allPlayerIds.size} unique players.`)
  return allPlayerIds
}

async function exportPlayer(playerId: number): Promise<void> {
  const [profile, rating, stats] = await Promise.all([
    fetchJson<any>(`${API}/players/${playerId}`),
    fetchJson<any>(`${API}/players/${playerId}/rating`),
    fetchJson<any[]>(`${API}/players/${playerId}/stats`),
  ])

  writeJson(`players/${playerId}.json`, {
    player: profile,
    rating: rating,
    stats: stats ?? [],
  })
}

async function exportAllPlayers(playerIds: Set<number>): Promise<void> {
  const ids = [...playerIds]
  console.log(`Exporting ${ids.length} player profiles...`)

  let done = 0
  await processInBatches(ids, async (id) => {
    await exportPlayer(id)
    done++
    if (done % 100 === 0) console.log(`  ${done}/${ids.length} players`)
    return id
  }, CONCURRENCY)

  console.log('  Done.')
}

async function exportAwards(): Promise<Set<number>> {
  console.log('Exporting awards...')

  const playerIds = new Set<number>()

  for (const type of ['PLAYER_OF_MATCH', 'PLAYER_OF_SEASON', 'BEST_DEFENSIVE']) {
    const awards = await fetchJson<any[]>(`${API}/awards?type=${type}&limit=50`)
    const data = awards ?? []

    // Collect player IDs for rating fetch
    data.forEach((a: any) => {
      if (a.player?.id) playerIds.add(a.player.id)
    })

    const fileName = type.toLowerCase().replace(/_/g, '-')
    writeJson(`awards/${fileName}.json`, data)
    console.log(`  ${type}: ${data.length} awards`)
  }

  // Fetch ratings for award winners and save separately
  const ratingEntries: [number, any][] = []
  await processInBatches([...playerIds], async (pid) => {
    const rating = await fetchJson<any>(`${API}/players/${pid}/rating`)
    if (rating) ratingEntries.push([pid, rating])
    return pid
  }, CONCURRENCY)

  const ratingsMap = Object.fromEntries(ratingEntries)
  writeJson('awards/ratings.json', ratingsMap)
  console.log(`  ${ratingEntries.length} player ratings for awards`)

  return playerIds
}

async function exportStats(): Promise<Set<number>> {
  console.log('Exporting stats...')

  const playerIds = new Set<number>()

  for (const stat of ['top-scorers', 'top-assists', 'top-ratings', 'team-rankings']) {
    const data = await fetchJson<any[]>(`${API}/stats/${stat}?limit=20`)
    writeJson(`stats/${stat}.json`, data ?? [])

    // Collect player IDs
    if (stat !== 'team-rankings') {
      (data ?? []).forEach((row: any) => {
        if (row.player?.id) playerIds.add(row.player.id)
      })
    }

    console.log(`  ${stat}: ${(data ?? []).length} rows`)
  }

  return playerIds
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nNITBox Static Export`)
  console.log(`API: ${API}`)
  console.log(`Output: ${OUT}\n`)

  // Clean output directory
  if (fs.existsSync(OUT)) {
    fs.rmSync(OUT, { recursive: true })
  }
  fs.mkdirSync(OUT, { recursive: true })

  // 1. Export match lists
  const { resultIds, upcomingIds } = await exportMatchesLists()
  const allMatchIds = [...new Set([...resultIds, ...upcomingIds])]

  // 2. Export match details (and collect player IDs)
  const matchPlayerIds = await exportAllMatchDetails(allMatchIds)

  // 3. Export awards (and collect player IDs)
  const awardPlayerIds = await exportAwards()

  // 4. Export stats (and collect player IDs)
  const statsPlayerIds = await exportStats()

  // 5. Merge all player IDs and export
  const allPlayerIds = new Set([...matchPlayerIds, ...awardPlayerIds, ...statsPlayerIds])
  await exportAllPlayers(allPlayerIds)

  // 6. Write manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    matchIds: allMatchIds.sort((a, b) => a - b),
    playerIds: [...allPlayerIds].sort((a, b) => a - b),
    counts: {
      matches: allMatchIds.length,
      players: allPlayerIds.size,
    },
  }
  writeJson('manifest.json', manifest)

  console.log(`\nExport complete!`)
  console.log(`  Matches: ${manifest.counts.matches}`)
  console.log(`  Players: ${manifest.counts.players}`)
  console.log(`  Output:  ${OUT}\n`)
}

main().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})
