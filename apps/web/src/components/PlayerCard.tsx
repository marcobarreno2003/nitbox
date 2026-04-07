'use client'

// =============================================================================
// PlayerCard — Collectible-style player card with hexagonal attribute radar.
// Attributes with value -1 mean "no data" and render greyed-out.
// Shows data confidence badge based on matches analyzed.
// =============================================================================

import HexRadar from './HexRadar'

export interface PlayerRating {
  player_id:        number
  player_name:      string
  position:         string
  overall:          number
  attributes:       Record<string, number>   // -1 = no data
  attr_labels:      string[]
  matches_analyzed: number
  data_confidence:  'high' | 'medium' | 'low'
  has_api_rating:   boolean
}

interface PlayerCardProps {
  rating:      PlayerRating
  photoUrl?:   string | null
  nationality?: string
  flagUrl?:    string | null
  size?:       'sm' | 'md' | 'lg'
}

const POSITION_COLOR: Record<string, string> = {
  GK:  'text-yellow-400 bg-yellow-400/10',
  CB:  'text-blue-400   bg-blue-400/10',
  LB:  'text-blue-400   bg-blue-400/10',
  RB:  'text-blue-400   bg-blue-400/10',
  CDM: 'text-teal-400   bg-teal-400/10',
  CM:  'text-green-400  bg-green-400/10',
  CAM: 'text-green-400  bg-green-400/10',
  LW:  'text-orange-400 bg-orange-400/10',
  RW:  'text-orange-400 bg-orange-400/10',
  ST:  'text-red-400    bg-red-400/10',
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   'text-emerald-400 bg-emerald-400/10',
  medium: 'text-yellow-400  bg-yellow-400/10',
  low:    'text-slate-400   bg-slate-500/10',
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
  const { overall, position, player_name, attributes, attr_labels, matches_analyzed, data_confidence } = rating
  // Pass -1 through to HexRadar directly (it handles no-data rendering)
  const values    = attr_labels.map(l => attributes[l] ?? -1)
  const posClass  = POSITION_COLOR[position] ?? 'text-slate-400 bg-slate-400/10'
  const confClass = CONFIDENCE_STYLE[data_confidence] ?? CONFIDENCE_STYLE.low
  const radarSize = RADAR_SIZE[size]

  return (
    <div className="
      relative flex flex-col items-center gap-3
      rounded-2xl border border-slate-700/60
      bg-gradient-to-b from-slate-800 to-slate-900
      p-4 shadow-xl w-fit select-none
    ">
      {/* Header: overall + position */}
      <div className="flex w-full items-start justify-between px-1">
        <div className="flex flex-col">
          <span className={`text-4xl font-black leading-none tracking-tight ${overallColor(overall)}`}>
            {overall}
          </span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
            OVR
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${posClass}`}>
            {position}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${confClass}`}>
            {matches_analyzed} partidos
          </span>
        </div>
      </div>

      {/* Hex Radar */}
      <div className="relative">
        <HexRadar
          labels={attr_labels}
          values={values}
          photoUrl={photoUrl}
          size={radarSize}
        />
      </div>

      {/* Player name + nationality */}
      <div className="flex items-center gap-2">
        {flagUrl && (
          <img src={flagUrl} alt={nationality ?? ''} className="h-4 w-auto rounded-sm opacity-85" />
        )}
        <span className="text-sm font-semibold text-slate-200 truncate max-w-[180px]">
          {player_name}
        </span>
        {nationality && (
          <span className="text-xs text-slate-500 font-medium">{nationality}</span>
        )}
      </div>

      {/* Attribute chips — show "—" for no-data attributes */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 w-full px-2 pb-1">
        {attr_labels.map(label => {
          const val    = attributes[label] ?? -1
          const noData = val < 0
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold uppercase w-7 shrink-0 ${noData ? 'text-slate-600' : 'text-slate-500'}`}>
                {label}
              </span>
              <span className={`text-sm font-bold tabular-nums ${noData ? 'text-slate-600' : 'text-slate-200'}`}>
                {noData ? '—' : val}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
