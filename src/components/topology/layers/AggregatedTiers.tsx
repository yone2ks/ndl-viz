/**
 * AggregatedTiers — far LOD の tier 集約表示
 *
 * 個別ノードの代わりに tier ごとの集約ピル（「spine ×2」等）を描き、
 * tier 間は集約リンク 1 本（リンク数ラベル付き）で結ぶ。
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import { rcfg } from '../theme'
import type { TierBand } from '../layout'
import type { CyEdgeData } from '../../../types/topology'

interface Props {
  tierBands: TierBand[]
  nodeTier: Map<string, number>
  pairMap: Map<string, CyEdgeData[]>
  graphW: number
}

export const AggregatedTiers = memo(function AggregatedTiers({ tierBands, nodeTier, pairMap, graphW }: Props) {
  const { theme, ui } = useGraphCtx()
  const cx = graphW / 2

  // tier ペアごとのリンク本数を集計
  const tierLinks = new Map<string, number>()
  pairMap.forEach(links => {
    const a = nodeTier.get(links[0].source)
    const b = nodeTier.get(links[0].target)
    if (a == null || b == null || a === b) return
    const key = [a, b].sort((x, y) => x - y).join('|')
    tierLinks.set(key, (tierLinks.get(key) ?? 0) + links.length)
  })

  const pillW = 200, pillH = 56
  const centers = tierBands.map(b => (b.yTop + b.yBot) / 2)

  return (
    <g className="lod-enter">
      {/* tier 間の集約リンク */}
      {Array.from(tierLinks.entries()).map(([key, count]) => {
        const [a, b] = key.split('|').map(Number)
        const y1 = centers[a] + pillH / 2, y2 = centers[b] - pillH / 2
        return (
          <g key={`agg-link-${key}`}>
            <line x1={cx} y1={y1} x2={cx} y2={y2}
              stroke={ui.linkDefault} strokeWidth={Math.min(2 + count * 0.7, 8)}
              strokeLinecap="round" opacity={0.7} />
            <text x={cx + 14} y={(y1 + y2) / 2}
              fill={ui.speedText} fontSize={11} dominantBaseline="middle"
              style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
              ×{count}
            </text>
          </g>
        )
      })}

      {/* tier 集約ピル */}
      {tierBands.map((band, i) => {
        const y = centers[i]
        const entries = Object.entries(band.roleCounts).sort((a, b) => b[1] - a[1])
        const domRole = entries[0]?.[0]
        const cfg = rcfg(domRole, theme)
        const total = entries.reduce((s, [, c]) => s + c, 0)
        const summary = entries.map(([r, c]) => `${r} ×${c}`).join('  ')
        return (
          <g key={`agg-tier-${i}`}>
            <rect x={cx - pillW / 2} y={y - pillH / 2} width={pillW} height={pillH} rx={14}
              fill={cfg.fill} stroke={cfg.stroke} strokeWidth={2} />
            <text x={cx} y={y - 8} textAnchor="middle"
              fill={ui.labelText} fontSize={15} fontWeight={700}
              style={{ fontFamily:'"SF Mono","Fira Code",monospace', pointerEvents:'none' }}>
              {band.label}
            </text>
            <text x={cx} y={y + 14} textAnchor="middle"
              fill={ui.speedText} fontSize={10.5}
              style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
              {total > 1 ? summary : `${domRole} ×1`}
            </text>
          </g>
        )
      })}
    </g>
  )
})
