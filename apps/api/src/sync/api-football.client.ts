// Thin wrapper around the API-Football v3 REST API.
// All sync services call through here so the base URL and auth header
// live in exactly one place.

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const BASE = 'https://v3.football.api-sports.io'

export class DailyLimitError extends Error {
  constructor() { super('API-Football daily request limit reached') }
}

@Injectable()
export class ApiFootballClient {
  private readonly logger = new Logger(ApiFootballClient.name)

  constructor(private readonly config: ConfigService) {}

  async get<T = any>(path: string): Promise<T> {
    const apiKey = this.config.get<string>('API_FOOTBALL_KEY')
    const url    = `${BASE}${path}`

    const res = await fetch(url, {
      headers: { 'x-apisports-key': apiKey! },
    })

    if (!res.ok) {
      this.logger.warn(`API-Football ${path} → HTTP ${res.status}`)
      return { response: [] } as T
    }

    const json = await res.json() as any

    // Check for daily limit exceeded (errors array or specific error code)
    const errors = json.errors
    if (errors && (
      (Array.isArray(errors) && errors.length > 0) ||
      (typeof errors === 'object' && Object.keys(errors).length > 0)
    )) {
      const msg = Array.isArray(errors) ? errors[0] : Object.values(errors)[0]
      if (String(msg).toLowerCase().includes('limit')) throw new DailyLimitError()
      this.logger.warn(`API-Football error on ${path}: ${msg}`)
      return { response: [] } as T
    }

    return json as T
  }
}
