// Centralized API fetching utilities
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export async function apiFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate } })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Team {
  id: number
  name: string
  fifaCode: string | null
  logoUrl: string | null
}

export interface Competition {
  id: number
  name: string
  logoUrl: string | null
}

export interface CompetitionSeason {
  id: number
  apiFootballSeason: number
  competition: Competition
}

export interface Match {
  id: number
  kickoffAt: string | null
  statusShort: string
  statusLong: string
  elapsed: number | null
  homeScore: number | null
  awayScore: number | null
  homeTeam: Team
  awayTeam: Team
  competitionSeason: CompetitionSeason
}

export interface LineupPlayer {
  id: number
  shirtNumber: number | null
  position: string | null       // deprecated, use positionCode
  positionCode: string | null   // G / D / M / F
  gridPosition: string | null   // "row:col"
  isStarter: boolean
  player: {
    id: number
    firstName: string | null
    lastName: string | null
    commonName: string | null
    photoUrl: string | null
  }
}

export interface Lineup {
  id: number
  formation: string | null
  team: Team
  coach: {
    id: number
    firstName: string | null
    lastName: string | null
    photoUrl: string | null
  } | null
  lineupPlayers: LineupPlayer[]
}

export interface MatchEvent {
  id: number
  minute: number | null
  extraMinute: number | null
  type: string
  detail: string | null
  comments: string | null
  team: { id: number; name: string; fifaCode: string | null }
  player: { id: number; firstName: string | null; lastName: string | null; commonName: string | null } | null
  assistPlayer: { id: number; firstName: string | null; lastName: string | null; commonName: string | null } | null
}

export interface MatchDetail extends Match {
  venue: { name: string; city: string } | null
  teamStatistics: any[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function playerName(p: { firstName?: string | null; lastName?: string | null; commonName?: string | null } | null): string {
  if (!p) return '—'
  if (p.commonName) return p.commonName
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || '—'
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function statusLabel(match: Pick<Match, 'statusShort' | 'elapsed'>): string {
  const s = match.statusShort
  if (s === 'FT')  return 'FT'
  if (s === 'HT')  return 'HT'
  if (s === 'NS')  return 'Upcoming'
  if (s === 'AET') return 'AET'
  if (s === 'PEN') return 'PEN'
  if (match.elapsed != null) return `${match.elapsed}'`
  return s
}

export function isLive(statusShort: string): boolean {
  return ['1H','2H','HT','ET','BT','P','INT','LIVE'].includes(statusShort)
}
