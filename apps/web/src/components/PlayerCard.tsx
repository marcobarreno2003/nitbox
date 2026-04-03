'use client'

// =============================================================================
// PlayerCard — Displays a player with hexagonal attribute radar.
// Shows overall rating, position, player photo inside the hex radar,
// and a row of stat chips below.
// =============================================================================

import HexRadar from './HexRadar'

export interface PlayerRating {
  player_id:   number
  player_name: string
  position:    string
  overall:     number
  /** e.g. { PAC: 82, SHO: 87, PAS: 91, DRI: 93, DEF: 24, PHY: 54 } */
  attributes:  Record<string, number>
  /** Ordered label list for radar axes, e.g. ["PAC","SHO","PAS","DRI","DEF","PHY"] */
  attr_labels: string[]
}

interface PlayerCardProps {
  rating:      PlayerRating
  photoUrl?:   string | null
  nationality?: string        // e.g. "ARG"
  flagUrl?:    string | null
  /** Card size variant. Default: "md" */
  size?:       'sm' | 'md' | 'lg'
}

const POSITION_COLOR: Record<string, string> = {
  GK: 'text-yellow-400  bg-yellow-400/10',
  CB: 'text-blue-400    bg-blue-400/10',
  CM: 'text-green-400   bg-green-400/10',
  ST: 'text-red-400     bg-red-400/10',
}

const RADAR_SIZE: Record<string, number> = { sm: 220, md: 300, lg: 380 }

function overallColor(v: number) {
  if (v >= 85) return 'text-yellow-300'
  if (v >= 75) return 'text-green-400'
  if (v >= 60) return 'text-sky-400'
  return 'text-slate-400'
}

export default function PlayerCard({
  rating,
  photoUrl,
  nationality,
  flagUrl,
  size = 'md',
}: PlayerCardProps) {
  const { overall, position, player_name, attributes, attr_labels } = rating
  const values = attr_labels.map(l => attributes[l] ?? 0)
  const posClass = POSITION_COLOR[position] ?? 'text-slate-400 bg-slate-400/10'
  const radarSize = RADAR_SIZE[size]

  return (
    <div className="
      relative flex flex-col items-center gap-3
      rounded-2xl border border-slate-700/60
      bg-gradient-to-b from-slate-800 to-slate-900
      p-4 shadow-xl
      w-fit select-none
    ">
      {/* ── Header row: overall + position ── */}
      <div className="flex w-full items-start justify-between px-1">
        <div className="flex flex-col">
          <span className={`text-4xl font-black leading-none tracking-tight ${overallColor(overall)}`}>
            {overall}
          </span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
            OVR
          </span>
        </div>

        <span className={`text-sm font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${posClass}`}>
          {position}
        </span>
      </div>

      {/* ── Hex Radar (photo lives inside the SVG) ── */}
      <div className="relative">
        <HexRadar
          labels={attr_labels}
          values={values}
          photoUrl={photoUrl}
          size={radarSize}
        />
      </div>

      {/* ── Player name + nationality ── */}
      <div className="flex items-center gap-2">
        {flagUrl && (
          <img
            src={flagUrl}
            alt={nationality ?? ''}
            className="h-4 w-auto rounded-sm opacity-85"
          />
        )}
        <span className="text-sm font-semibold text-slate-200 truncate max-w-[180px]">
          {player_name}
        </span>
        {nationality && (
          <span className="text-xs text-slate-500 font-medium">{nationality}</span>
        )}
      </div>

      {/* ── Attribute chips row ── */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 w-full px-2 pb-1">
        {attr_labels.map(label => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase w-7 shrink-0">
              {label}
            </span>
            <span className="text-sm font-bold text-slate-200 tabular-nums">
              {attributes[label] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
