// =============================================================================
// API-Football HTTP Client
// Handles rate limiting and response parsing
// =============================================================================

import { API_BASE_URL } from './config';

export class DailyLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'DailyLimitError';
  }
}

const API_KEY = process.env.API_FOOTBALL_KEY!;

const DELAY_MS = 6500; 

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

  const json = await res.json() as { response: T[]; errors: Record<string, string> };

  if (json.errors && Object.keys(json.errors).length > 0) {
    const errorMsg = Object.values(json.errors).join(' ');
    if (errorMsg.toLowerCase().includes('request limit')) {
      throw new DailyLimitError(errorMsg);
    }
    console.warn('  [WARN] API warnings:', json.errors);
  }

  await sleep(DELAY_MS);
  return json.response;
}
