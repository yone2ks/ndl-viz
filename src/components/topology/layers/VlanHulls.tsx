/**
 * VlanHulls — VLAN メンバーシップの凸包ハル表示（L2 overlay）
 *
 * メンバー L1 ノード群 + VLAN ピルを包む凸包を半透明で塗る。
 * VLAN ごとに色相を回し、ホバー時は非メンバーの VLAN ハルを減光する。
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import { convexHull, rectCorners, type Pt } from '../utils/hull'
import type { NodeLayout } from '../layout'

interface Props {
  vlanMembers: Map<string, string[]>
  vlanMap: Map<string, NodeLayout>
  effectiveNodeMap: Map<string, NodeLayout>
}

export const VlanHulls = memo(function VlanHulls({ vlanMembers, vlanMap, effectiveNodeMap }: Props) {
  const { theme, overlays, hoveredId } = useGraphCtx()
  const visible = overlays.has('l2')
  const PAD = 26

  return (
    <>
      {Array.from(vlanMembers.entries()).map(([vlanId, memberIds], idx) => {
        const pts: Pt[] = []
        memberIds.forEach(id => {
          const n = effectiveNodeMap.get(id)
          if (n) pts.push(...rectCorners(n.x, n.y, n.w, n.h, PAD))
        })
        const pill = vlanMap.get(vlanId)
        if (pill) pts.push(...rectCorners(pill.x, pill.y, pill.w, pill.h, 14))
        if (pts.length < 3) return null

        const hull = convexHull(pts)
        const hue = (38 + idx * 47) % 360
        const sat = theme === 'dark' ? 75 : 65
        const lit = theme === 'dark' ? 55 : 45
        const dim = hoveredId !== null && !memberIds.includes(hoveredId)

        return (
          <polygon key={`hull-${vlanId}`}
            className={`ov-able fog-able${visible ? '' : ' ov-off'}${dim ? ' fog-dim' : ''}`}
            points={hull.map(p => `${p.x},${p.y}`).join(' ')}
            fill={`hsla(${hue}, ${sat}%, ${lit}%, 0.09)`}
            stroke={`hsla(${hue}, ${sat}%, ${lit}%, 0.09)`}
            strokeWidth={28} strokeLinejoin="round"
            style={{ pointerEvents: 'none' }} />
        )
      })}
    </>
  )
})
