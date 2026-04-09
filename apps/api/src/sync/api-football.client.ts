// Thin wrapper around the API-Football v3 REST API.
// Handles rate limiting, timeouts, and 429 retries.
// All sync services call through here so the base URL and auth header
// live in exactly one place.

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const BASE         = 'https://v3.football.api-sports.io'
const DELAY_MS     = 1500   // Starter plan: ~30 req/min
const TIMEOUT_MS   = 15_000 // 15s per request
const MAX_RETRIES  = 3

export class DailyLimitError extends Error {
  constructor() { super('API-Football daily request limit reached') }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

@Injectable()
export class ApiFootballClient {
  private readonly logger = new Logger(ApiFootballClient.name)

  constructor(private readonly config: ConfigService) {}

  async get<T = any>(path: string, attempt = 1): Promise<T> {
    const apiKey = this.config.get<string>('API_FOOTBALL_KEY')
    if (!apiKey) {
      this.logger.error('API_FOOTBALL_KEY is not set')
      return { response: [] } as T
    }

    const url = `${BASE}${path}`

    // Fetch with timeout via AbortController
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'x-apisports-key': apiKey },
        signal: controller.signal,
      })
    } catch (err: any) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        this.logger.warn(`API-Football timeout (${TIMEOUT_MS}ms): ${path}`)
        return { response: [] } as T
      }
      throw err
    } finally {
      clearTimeout(timer)
    }

    // 429 — rate limited: retry with exponential backoff
    if (res.status === 429) {
      if (attempt > MAX_RETRIES) {
        this.logger.error(`Rate limited after ${MAX_RETRIES} retries: ${path}`)
        return { response: [] } as T
      }
      const retryAfter = parseInt(res.headers.get('retry-after') ?? String(attempt * 5))
      this.logger.warn(`[429] Rate limited on ${path} — retrying in ${retryAfter}s (attempt ${attempt}/${MAX_RETRIES})`)
      await sleep(retryAfter * 1000)
      return this.get<T>(path, attempt + 1)
    }

    if (!res.ok) {
      this.logger.warn(`API-Football ${path} → HTTP ${res.status}`)
      return { response: [] } as T
    }

    const json = await res.json() as any

    // Check for daily limit exceeded
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

    // Rate limit delay between calls
    await sleep(DELAY_MS)

    return json as T
  }
}
