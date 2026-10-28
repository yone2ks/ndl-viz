/**
 * MlagDomains — MLAG ペア（leaf1/leaf2）を amber 破線矩形で囲む（常時表示）
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import type { NodeLayout } from '../layout'

interface Props {
  mlagDomains: Map<string, string[]>
  effectiveNodeMap: Map<string, NodeLayout>
}

export const MlagDomains = memo(function MlagDomains({ mlagDomains, effectiveNodeMap }: Props) {
  const { theme, hoveredId } = useGraphCtx()
  return (
    <>
      {Array.from(mlagDomains.entries()).map(([lagId, nodeIds]) => {
        const nodes = nodeIds
          .map(id => effectiveNodeMap.get(id))
          .filter((n): n is NodeLayout => !!n)
        if (nodes.length < 2) return null
        const PAD = 24
        const x1 = Math.min(...nodes.map(n => n.x - n.w / 2)) - PAD
        const y1 = Math.min(...nodes.map(n => n.y - n.h / 2)) - PAD
        const x2 = Math.max(...nodes.map(n => n.x + n.w / 2)) + PAD
        const y2 = Math.max(...nodes.map(n => n.y + n.h / 2)) + PAD
        const amber = theme === 'dark' ? '#D97706' : '#B45309'
        const amberFill = theme === 'dark' ? 'rgba(217,119,6,0.05)' : 'rgba(180,83,9,0.06)'
        const dim = hoveredId !== null && !nodeIds.includes(hoveredId)
        return (
          <g key={`mlag-domain-${lagId}`} className={`fog-able${dim ? ' fog-dim' : ''}`}>
            <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1}
              rx={12} fill={amberFill}
              stroke={amber} strokeWidth={1.4} strokeDasharray="8 4" />
            <text x={x1 + 8} y={y1 + 13}
              fill={amber} fontSize={9} fontWeight={700}
              style={{ fontFamily:'"SF Mono",monospace',
                       letterSpacing:'0.08em', pointerEvents:'none' }}>
              MLAG
            </text>
          </g>
        )
      })}
    </>
  )
})
