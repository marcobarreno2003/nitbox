// =============================================================================
// API-Football HTTP Client
// Handles rate limiting, 429 retries with backoff, timeouts, response parsing.
// =============================================================================

import { API_BASE_URL } from './config';

export class DailyLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'DailyLimitError';
  }
}

const API_KEY     = process.env.API_FOOTBALL_KEY!;
const DELAY_MS    = 1500;   // Starter plan: ~30 req/min
const TIMEOUT_MS  = 15_000; // 15s per request
const MAX_RETRIES = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'x-apisports-key': API_KEY },
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error(`API timeout (${TIMEOUT_MS}ms): ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  endpoint: string,
  params: Record<string, string | number>,
  attempt = 1,
): Promise<T> {
  const url = new URL(`${API_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  console.log(`  → GET /${endpoint} ${JSON.stringify(params)}`);

  const res = await fetchWithTimeout(url.toString());

  // 429 — rate limited: respect Retry-After, then retry with exponential backoff
  if (res.status === 429) {
    if (attempt > MAX_RETRIES) {
      throw new Error(`Rate limited after ${MAX_RETRIES} retries: /${endpoint}`);
    }
    const retryAfter = parseInt(res.headers.get('retry-after') ?? String(attempt * 5));
    console.warn(`  [429] Rate limited — retrying in ${retryAfter}s (attempt ${attempt}/${MAX_RETRIES})`);
    await sleep(retryAfter * 1000);
    return request(endpoint, params, attempt + 1);
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);

  const json = await res.json() as { response: T; errors: Record<string, string> };

  if (json.errors && Object.keys(json.errors).length > 0) {
    const errorMsg = Object.values(json.errors).join(' ');
    if (errorMsg.toLowerCase().includes('request limit')) throw new DailyLimitError(errorMsg);
    console.warn('  [WARN] API warnings:', json.errors);
  }

  await sleep(DELAY_MS);
  return json.response;
}

// For endpoints that return a single object (e.g. teams/statistics)
export async function apiGetOne<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const response = await request<T | null>(endpoint, params);
  return response ?? null;
}

// For endpoints that return an array
export async function apiGet<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const response = await request<T[] | null>(endpoint, params);
  return response ?? [];
}
