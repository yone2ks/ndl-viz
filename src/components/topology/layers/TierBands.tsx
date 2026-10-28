/**
 * TierBands — dagre rank ごとの Y 帯の間に薄い破線 + 左端ラベル（最背面）
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import type { TierBand } from '../layout'

interface Props { tierBands: TierBand[]; graphW: number }

export const TierBands = memo(function TierBands({ tierBands, graphW }: Props) {
  const { theme } = useGraphCtx()
  if (tierBands.length < 2) return null
  const sepColor  = theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)'
  const lblColor  = theme === 'dark' ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.25)'
  const left = -50, right = graphW + 50
  return (
    <>
      {/* tier ラベル */}
      {tierBands.map((band, i) => (
        <text key={`tlbl-${i}`}
          x={left - 8} y={(band.yTop + band.yBot) / 2}
          fill={lblColor} fontSize={9} fontWeight={700}
          textAnchor="end" dominantBaseline="middle"
          style={{ fontFamily:'"SF Mono","Fira Code",monospace',
                   letterSpacing:'0.07em', textTransform:'uppercase',
                   pointerEvents:'none' }}>
          {band.label}
        </text>
      ))}
      {/* tier 間の区切り線 */}
      {tierBands.slice(0, -1).map((band, i) => {
        const sepY = (band.yBot + tierBands[i + 1].yTop) / 2
        return (
          <line key={`tsep-${i}`}
            x1={left} y1={sepY} x2={right} y2={sepY}
            stroke={sepColor} strokeWidth={1} strokeDasharray="5 7" />
        )
      })}
    </>
  )
})
