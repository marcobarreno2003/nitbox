'use client'

// =============================================================================
// HexRadar — Hexagonal radar chart with player photo in center.
// Values of -1 indicate "no data" and render as greyed-out segments.
// =============================================================================

interface HexRadarProps {
  labels:          string[]
  /** Values 0–100, or -1 for "no data". */
  values:          number[]
  photoUrl?:       string | null
  size?:           number
  radiusFraction?: number
}

const NUM_AXES   = 6
const GRID_LEVELS = [25, 50, 75, 100]

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: NUM_AXES }, (_, i) => {
    const { x, y } = polarToXY(cx, cy, r, i * 60)
    return `${x},${y}`
  }).join(' ')
}

/** Build the fill polygon, treating -1 (no data) as 0 for shape purposes. */
function valuePoints(cx: number, cy: number, maxR: number, values: number[]): string {
  return values.map((v, i) => {
    const effective = v < 0 ? 0 : v
    const { x, y } = polarToXY(cx, cy, maxR * (effective / 100), i * 60)
    return `${x},${y}`
  }).join(' ')
}

export default function HexRadar({
  labels,
  values,
  photoUrl,
  size           = 320,
  radiusFraction = 0.52,
}: HexRadarProps) {
  const cx     = size / 2
  const cy     = size / 2
  const maxR   = size * radiusFraction
  const labelR = maxR + 22
  const valueR = maxR + 10
  const photoR = maxR * 0.38

  const clipId = `hex-photo-clip-${Math.random().toString(36).slice(2, 7)}`
  const gradId = `hex-fill-grad-${Math.random().toString(36).slice(2, 7)}`

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-label="Player attribute radar chart"
    >
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.20" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={photoR} />
        </clipPath>
      </defs>

      {/* Grid hexagons */}
      {GRID_LEVELS.map(lvl => (
        <polygon
          key={lvl}
          points={hexPoints(cx, cy, maxR * (lvl / 100))}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={lvl === 100 ? 1.5 : 1}
        />
      ))}

      {/* Axis lines — grey if no data */}
      {Array.from({ length: NUM_AXES }, (_, i) => {
        const tip     = polarToXY(cx, cy, maxR, i * 60)
        const noData  = values[i] < 0
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={tip.x} y2={tip.y}
            stroke={noData ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.22)'}
            strokeWidth={1}
          />
        )
      })}

      {/* Colored fill */}
      <polygon
        points={valuePoints(cx, cy, maxR, values)}
        fill={`url(#${gradId})`}
        stroke="#38bdf8"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Player photo */}
      {photoUrl ? (
        <>
          <circle cx={cx} cy={cy} r={photoR + 2} fill="rgba(0,0,0,0.35)" />
          <image
            href={photoUrl}
            x={cx - photoR}
            y={cy - photoR}
            width={photoR * 2}
            height={photoR * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
          <circle cx={cx} cy={cy} r={photoR} fill="none" stroke="rgba(56,189,248,0.6)" strokeWidth={2} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={photoR} fill="rgba(30,41,59,0.9)" stroke="rgba(56,189,248,0.4)" strokeWidth={1.5} />
      )}

      {/* Axis tip dots — grey when no data */}
      {Array.from({ length: NUM_AXES }, (_, i) => {
        const { x, y } = polarToXY(cx, cy, maxR, i * 60)
        const noData   = values[i] < 0
        return (
          <circle
            key={i} cx={x} cy={y} r={3}
            fill={noData ? 'rgba(100,116,139,0.4)' : '#38bdf8'}
          />
        )
      })}

      {/* Labels and values at each tip */}
      {labels.map((label, i) => {
        const angleDeg  = i * 60
        const labelPos  = polarToXY(cx, cy, labelR, angleDeg)
        const valuePos  = polarToXY(cx, cy, valueR, angleDeg)
        const noData    = values[i] < 0

        let textAnchor: 'start' | 'middle' | 'end' = 'middle'
        const norm = ((angleDeg % 360) + 360) % 360
        if (norm > 15  && norm < 165) textAnchor = 'start'
        if (norm > 195 && norm < 345) textAnchor = 'end'

        return (
          <g key={label}>
            <text
              x={labelPos.x} y={labelPos.y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize={11} fontWeight="700"
              letterSpacing="0.05em"
              fill={noData ? 'rgba(100,116,139,0.55)' : 'rgba(226,232,240,0.90)'}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {label}
            </text>
            <text
              x={valuePos.x} y={valuePos.y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize={10} fontWeight="600"
              fill={noData ? 'rgba(100,116,139,0.50)' : '#7dd3fc'}
              fontFamily="ui-monospace, monospace"
            >
              {noData ? '—' : values[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
