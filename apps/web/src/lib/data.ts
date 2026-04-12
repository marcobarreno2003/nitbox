/**
 * Static data reader — replaces apiFetch for the static export build.
 * Reads pre-generated JSON files from apps/web/data/ at build time.
 */

import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')

export function readData<T>(filePath: string): T | null {
  try {
    const full = path.join(DATA_DIR, filePath)
    const raw = fs.readFileSync(full, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export interface Manifest {
  exportedAt: string
  matchIds: number[]
  playerIds: number[]
  counts: { matches: number; players: number }
}

export function readManifest(): Manifest | null {
  return readData<Manifest>('manifest.json')
}
