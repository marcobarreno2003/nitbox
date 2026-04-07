'use client'

// =============================================================================
// RatingHistoryChart — simple SVG bar chart for player match ratings (0–10).
// Shows up to 5 bars with color coding: green ≥8, yellow ≥7, sky ≥6, red <6.
// =============================================================================

interface DataPoint {
  label:  string   // e.g. "May 10"
  rating: number   // 0–10
  vs:     string   // opponent FIFA code
}

interface Props {
  data: DataPoint[]
}

function barColor(r: number) {
  if (r >= 8.0) return '#4ade80'   // green-400
  if (r >= 7.0) return '#facc15'   // yellow-400
  if (r >= 6.0) return '#38bdf8'   // sky-400
  return '#f87171'                  // red-400
}

const W        = 400
const H        = 140
const PAD_L    = 28
const PAD_R    = 12
const PAD_T    = 12
const PAD_B    = 36
const CHART_W  = W - PAD_L - PAD_R
const CHART_H  = H - PAD_T - PAD_B
const MAX_VAL  = 10

export default function RatingHistoryChart({ data }: Props) {
  if (!data.length) return null

  const barW   = CHART_W / data.length
  const barGap = barW * 0.25

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W }}
        aria-label="Rating history chart"
      >
        {/* Y-axis grid lines at 6, 7, 8, 10 */}
        {[6, 7, 8, 10].map(v => {
          const y = PAD_T + CHART_H - (v / MAX_VAL) * CHART_H
          return (
            <g key={v}>
              <line
                x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                stroke="rgba(148,163,184,0.10)"
                strokeWidth={1}
                strokeDasharray={v === 10 ? undefined : '3 3'}
              />
              <text
                x={PAD_L - 4} y={y}
                textAnchor="end" dominantBaseline="middle"
                fontSize={9} fill="rgba(148,163,184,0.50)"
                fontFamily="ui-monospace, monospace"
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const bx     = PAD_L + i * barW + barGap / 2
          const bw     = barW - barGap
          const bh     = (d.rating / MAX_VAL) * CHART_H
          const by     = PAD_T + CHART_H - bh
          const color  = barColor(d.rating)
          const labelY = H - PAD_B + 14

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={bx} y={by}
                width={bw} height={bh}
                rx={3}
                fill={color}
                fillOpacity={0.75}
              />
              {/* Rating value on top */}
              <text
                x={bx + bw / 2} y={by - 4}
                textAnchor="middle"
                fontSize={10} fontWeight="700"
                fill={color}
                fontFamily="ui-monospace, monospace"
              >
                {d.rating.toFixed(1)}
              </text>
              {/* Opponent label */}
              <text
                x={bx + bw / 2} y={labelY}
                textAnchor="middle"
                fontSize={9} fontWeight="600"
                fill="rgba(148,163,184,0.70)"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {d.vs}
              </text>
              {/* Date label */}
              <text
                x={bx + bw / 2} y={labelY + 12}
                textAnchor="middle"
                fontSize={8}
                fill="rgba(100,116,139,0.70)"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
