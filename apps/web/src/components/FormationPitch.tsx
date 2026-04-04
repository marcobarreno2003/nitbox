'use client'

// =============================================================================
// FormationPitch — Visual football pitch with players positioned by gridPosition.
// gridPosition format: "row:col" where row 1 = GK (bottom), higher rows = top.
// =============================================================================

interface PitchPlayer {
  id: number
  shirtNumber: number | null
  gridPosition: string | null
  isStarter: boolean
  player: {
    id: number
    firstName: string | null
    lastName: string | null
    commonName: string | null
    photoUrl: string | null
  }
}

interface FormationPitchProps {
  formation:      string | null
  players:        PitchPlayer[]
  color?:         string
  onPlayerClick?: (playerId: number) => void
}

function shortName(p: { firstName?: string | null; lastName?: string | null; commonName?: string | null }): string {
  if (p.commonName) {
    const parts = p.commonName.split(' ')
    return parts[parts.length - 1]!
  }
  return p.lastName ?? p.firstName ?? '?'
}

function initials(p: { firstName?: string | null; lastName?: string | null; commonName?: string | null }): string {
  const name = p.commonName ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`
  return name.trim().split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

export default function FormationPitch({ formation, players, color = '#1d4ed8', onPlayerClick }: FormationPitchProps) {
  const starters = players.filter(p => p.isStarter && p.gridPosition)

  // Parse "row:col" positions
  const cells = starters.map(p => {
    const [r, c] = p.gridPosition!.split(':').map(Number)
    return { row: r ?? 1, col: c ?? 1, player: p }
  }).sort((a, b) => a.row - b.row || a.col - b.col)

  const maxRow = Math.max(...cells.map(c => c.row), 1)

  // Group by row
  const rowGroups = Array.from({ length: maxRow }, (_, i) => i + 1)
    .map(r => ({ row: r, cells: cells.filter(c => c.row === r) }))

  // ── SVG layout ──────────────────────────────────────────────────
  const W  = 320
  const H  = 480
  const R  = 19   // bubble radius

  // Usable area — keep players inside pitch markings
  const LEFT   = 30
  const RIGHT  = W - 30
  const TOP    = 38    // attackers (high row)
  const BOTTOM = H - 38  // GK (row 1)

  // Row 1 = bottom (GK), maxRow = top (attackers)
  function rowY(row: number): number {
    if (maxRow === 1) return BOTTOM
    return BOTTOM - ((row - 1) / (maxRow - 1)) * (BOTTOM - TOP)
  }

  function colX(col: number, total: number): number {
    if (total === 1) return W / 2
    const span = RIGHT - LEFT
    return LEFT + ((col - 1) / (total - 1)) * span
  }

  return (
    <div className="w-full">
      {formation && (
        <p className="text-center text-xs font-mono text-text-muted mb-1">{formation}</p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl overflow-hidden">

        {/* Background */}
        <rect width={W} height={H} fill="#2d6a2d" rx="10" />

        {/* Grass stripes */}
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={0} y={i * (H / 8)} width={W} height={H / 8}
            fill={i % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'transparent'} />
        ))}

        {/* Pitch outline */}
        <rect x={16} y={16} width={W - 32} height={H - 32}
          fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} rx={3} />

        {/* Centre line */}
        <line x1={16} y1={H / 2} x2={W - 16} y2={H / 2}
          stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />

        {/* Centre circle */}
        <circle cx={W / 2} cy={H / 2} r={38}
          fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
        <circle cx={W / 2} cy={H / 2} r={2} fill="rgba(255,255,255,0.7)" />

        {/* Top penalty box (opponent end) */}
        <rect x={68} y={16} width={W - 136} height={72}
          fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        <rect x={104} y={16} width={W - 208} height={30}
          fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />

        {/* Bottom penalty box (GK end) */}
        <rect x={68} y={H - 88} width={W - 136} height={72}
          fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        <rect x={104} y={H - 46} width={W - 208} height={30}
          fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />

        {/* Players */}
        <defs>
          {cells.map(cell => (
            <clipPath key={`cp-${cell.player.id}`} id={`cp-${cell.player.id}`}>
              <circle cx={0} cy={0} r={R} />
            </clipPath>
          ))}
        </defs>

        {rowGroups.map(rowData =>
          rowData.cells.map(cell => {
            const x    = colX(cell.col, rowData.cells.length)
            const y    = rowY(cell.row)
            const name = shortName(cell.player.player)
            const init = initials(cell.player.player)
            const photo = cell.player.player.photoUrl

            return (
              <g
                key={cell.player.id}
                transform={`translate(${x},${y})`}
                onClick={() => onPlayerClick?.(cell.player.player.id)}
                style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
              >
                {/* Drop shadow */}
                <circle cx={1} cy={2} r={R} fill="rgba(0,0,0,0.4)" />

                {/* Fill */}
                <circle cx={0} cy={0} r={R} fill={color} />

                {/* Photo */}
                {photo ? (
                  <image
                    href={photo}
                    x={-R} y={-R} width={R * 2} height={R * 2}
                    clipPath={`url(#cp-${cell.player.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <text x={0} y={5} textAnchor="middle"
                    fontSize={10} fontWeight="bold" fill="white"
                    fontFamily="ui-sans-serif, system-ui, sans-serif">
                    {init}
                  </text>
                )}

                {/* Ring */}
                <circle cx={0} cy={0} r={R} fill="none" stroke="white" strokeWidth={1.5} />

                {/* Shirt number */}
                {cell.player.shirtNumber != null && (
                  <>
                    <circle cx={R - 5} cy={-R + 5} r={7} fill="rgba(0,0,0,0.8)" />
                    <text x={R - 5} y={-R + 9} textAnchor="middle"
                      fontSize={7} fontWeight="bold" fill="white"
                      fontFamily="ui-monospace, monospace">
                      {cell.player.shirtNumber}
                    </text>
                  </>
                )}

                {/* Name */}
                <text x={0} y={R + 11} textAnchor="middle"
                  fontSize={8.5} fontWeight="600" fill="white"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  paintOrder="stroke" stroke="rgba(0,0,0,0.7)" strokeWidth={2}>
                  {name.length > 11 ? name.slice(0, 11) + '…' : name}
                </text>
              </g>
            )
          })
        )}
      </svg>
    </div>
  )
}
