'use client'

// =============================================================================
// NitboxCard — Collectible player card (FIFA/FUTTIES style).
// Designed to be the showcase centrepiece on the /awards page and player page.
// =============================================================================

import HexRadar from './HexRadar'
import { type PlayerRating } from './PlayerCard'

interface NitboxCardProps {
  rating:      PlayerRating
  photoUrl?:   string | null
  flagUrl?:    string | null
  nationality?: string
  shirtNumber?: number | null
  /** Card tier affects the gradient theme. */
  tier?: 'gold' | 'silver' | 'teal' | 'purple'
}

const TIER_STYLES = {
  gold:   { bg: 'from-yellow-900/60 via-slate-900 to-slate-950', border: 'border-yellow-500/30', overall: 'text-yellow-300', shine: 'rgba(234,179,8,0.12)' },
  silver: { bg: 'from-slate-700/60 via-slate-900 to-slate-950',  border: 'border-slate-500/30',  overall: 'text-slate-200',  shine: 'rgba(148,163,184,0.10)' },
  teal:   { bg: 'from-teal-900/60 via-slate-900 to-slate-950',   border: 'border-teal-500/30',   overall: 'text-teal-300',   shine: 'rgba(20,184,166,0.12)' },
  purple: { bg: 'from-purple-900/60 via-slate-900 to-slate-950', border: 'border-purple-500/30', overall: 'text-purple-300', shine: 'rgba(168,85,247,0.12)' },
}

const POSITION_LABEL: Record<string, string> = {
  GK: 'GK', CB: 'CB', LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB',
  CDM: 'CDM', CM: 'CM', CAM: 'CAM', LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW', ST: 'ST', CF: 'CF',
}

function overallTier(overall: number): NitboxCardProps['tier'] {
  if (overall >= 85) return 'gold'
  if (overall >= 75) return 'teal'
  if (overall >= 65) return 'silver'
  return 'purple'
}

export default function NitboxCard({
  rating,
  photoUrl,
  flagUrl,
  nationality,
  shirtNumber,
  tier,
}: NitboxCardProps) {
  const resolvedTier = tier ?? overallTier(rating.overall)
  const styles       = TIER_STYLES[resolvedTier]
  const values       = rating.attr_labels.map(l => rating.attributes[l] ?? -1)
  const posLabel     = POSITION_LABEL[rating.position] ?? rating.position

  return (
    <div
      className={`
        relative flex flex-col items-center
        rounded-2xl border ${styles.border}
        bg-gradient-to-b ${styles.bg}
        shadow-2xl select-none overflow-hidden
        w-[240px]
      `}
      style={{ boxShadow: `0 0 40px ${styles.shine}, 0 25px 50px rgba(0,0,0,0.5)` }}
    >
      {/* NITBox watermark top */}
      <div className="w-full flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex flex-col items-start">
          <span className={`text-5xl font-black leading-none ${styles.overall}`}>
            {rating.overall}
          </span>
          <span className={`text-xs font-bold uppercase tracking-widest mt-0.5 ${styles.overall} opacity-70`}>
            {posLabel}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {flagUrl && (
            <img src={flagUrl} alt={nationality ?? ''} className="h-5 w-auto rounded-sm shadow" />
          )}
          {shirtNumber != null && (
            <span className="text-xs font-bold text-slate-500">#{shirtNumber}</span>
          )}
          <span className="text-[9px] font-black tracking-[0.2em] text-slate-600 uppercase">NITBox</span>
        </div>
      </div>

      {/* Radar with photo */}
      <div className="px-2 py-1">
        <HexRadar
          labels={rating.attr_labels}
          values={values}
          photoUrl={photoUrl}
          size={220}
          radiusFraction={0.50}
        />
      </div>

      {/* Player name */}
      <div className="w-full px-4 pb-1 text-center">
        <p className="text-sm font-black text-white tracking-tight truncate uppercase">
          {rating.player_name}
        </p>
        {nationality && (
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">{nationality}</p>
        )}
      </div>

      {/* Attribute row */}
      <div className="w-full grid grid-cols-3 gap-x-0 border-t border-slate-800/60 mt-1">
        {rating.attr_labels.map((label, i) => {
          const val    = rating.attributes[label] ?? -1
          const noData = val < 0
          const isLast = i === rating.attr_labels.length - 1
          return (
            <div
              key={label}
              className={`flex flex-col items-center py-2 ${i % 3 !== 2 ? 'border-r border-slate-800/60' : ''} ${i < 3 ? 'border-b border-slate-800/60' : ''}`}
            >
              <span className={`text-[9px] font-bold uppercase tracking-wider ${noData ? 'text-slate-700' : 'text-slate-500'}`}>
                {label}
              </span>
              <span className={`text-sm font-black tabular-nums ${noData ? 'text-slate-700' : styles.overall}`}>
                {noData ? '—' : val}
              </span>
            </div>
          )
        })}
      </div>

      {/* Confidence footer */}
      <div className="w-full px-4 py-2 flex items-center justify-between">
        <span className="text-[9px] text-slate-600 font-medium">
          {rating.matches_analyzed} partidos
        </span>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${
          rating.data_confidence === 'high'   ? 'text-emerald-500' :
          rating.data_confidence === 'medium' ? 'text-yellow-500'  : 'text-slate-600'
        }`}>
          {rating.data_confidence}
        </span>
      </div>
    </div>
  )
}
