// =============================================================================
// API-Football HTTP Client
// Handles rate limiting and response parsing
// =============================================================================

import { API_BASE_URL } from './config';

const API_KEY = process.env.API_FOOTBALL_KEY!;

// Free plan: 100 requests/day, ~10 req/min
const DELAY_MS = 1200; // ~50 req/min to be safe

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiGet<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const url = new URL(`${API_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  console.log(`  → GET /${endpoint} ${JSON.stringify(params)}`);

  const res = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { response: T[]; errors: unknown };

  if (json.errors && Object.keys(json.errors as object).length > 0) {
    console.warn('  [WARN] API warnings:', json.errors);
  }

  await sleep(DELAY_MS);
  return json.response;
}
