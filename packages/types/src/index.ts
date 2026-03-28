// Shared types — @nitbox/web + @nitbox/api

export interface Country {
  id: number
  name: string
  code: string
  flag: string
}

export interface Competition {
  id: number
  name: string
  type: 'world_cup' | 'copa_america' | 'qualifiers' | 'friendly'
  season: number
}

export interface Match {
  id: number
  homeTeam: Country
  awayTeam: Country
  competition: Competition
  date: string
  status: 'scheduled' | 'live' | 'finished'
  score: {
    home: number | null
    away: number | null
  }
}
