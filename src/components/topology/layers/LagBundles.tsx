/**
 * LagBundles — LACP バンドポリゴン + MLAG 収束ポリゴン
 *
 * LACP: 同一 src/tgt ペアに複数の LACP member が走る場合、
 *       外側2本の端点から平行四辺形を塗って束を表現する。
 * MLAG: 同一 lag_id で異なる src が同一 tgt に収束する場合、
 *       台形ポリゴンを半透明で描いて "束" を表現する。
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import { boundaryPt, edgePts } from '../geometry'
import { LAG_COLOR } from '../theme'
import type { NodeLayout, MlagPair } from '../layout'
import type { CyEdgeData } from '../../../types/topology'

interface Props {
  pairMap: Map<string, CyEdgeData[]>
  mlagGroups: Map<string, MlagPair[]>
  effectiveNodeMap: Map<string, NodeLayout>
}

export const LagBundles = memo(function LagBundles({ pairMap, mlagGroups, effectiveNodeMap }: Props) {
  const { theme, hoveredId } = useGraphCtx()
  const fogCls = (ids: string[]) =>
    `fog-able${hoveredId !== null && !ids.includes(hoveredId) ? ' fog-dim' : ''}`

  // ── LACP バンドポリゴン ──
  const lacpBands = Array.from(pairMap.entries()).map(([pkey, links]) => {
    if (links.length < 2) return null
    // Ethernet Segment の脚 (旧 MLAG) は下の収束ポリゴンで描くので、束の帯は 1 台の LAG だけ
    const firstLag  = links[0].lag_id
    if (!firstLag || links[0].ethernet_segment) return null
    if (!links.every(l => l.lag_id === firstLag && !l.ethernet_segment)) return null
    const src = effectiveNodeMap.get(links[0].source)
    const tgt = effectiveNodeMap.get(links[0].target)
    if (!src || !tgt) return null

    const p0 = edgePts(src, tgt, 0,              links.length)
    const pN = edgePts(src, tgt, links.length - 1, links.length)
    const pts = `${p0.x1},${p0.y1} ${pN.x1},${pN.y1} ${pN.x2},${pN.y2} ${p0.x2},${p0.y2}`
    const col  = LAG_COLOR.line
    const fill = theme === 'dark' ? 'rgba(5,150,105,0.10)' : 'rgba(5,150,105,0.08)'
    return (
      <polygon key={`lacp-band-${pkey}`}
        className={fogCls([links[0].source, links[0].target])}
        points={pts} fill={fill}
        stroke={col} strokeWidth={0.6} strokeLinejoin="round"
        style={{ pointerEvents: 'none' }} />
    )
  })

  // ── MLAG 収束ポリゴン ──
  const amber     = theme === 'dark' ? '#059669' : '#047857'
  const amberFill = theme === 'dark' ? 'rgba(5,150,105,0.13)' : 'rgba(5,150,105,0.09)'
  const mlagPolys: React.ReactNode[] = []
  mlagGroups.forEach((pairs, lagId) => {
    // tgtId ごとに srcId をグループ化
    const tgtMap = new Map<string, string[]>()
    pairs.forEach(p => {
      if (!tgtMap.has(p.tgtId)) tgtMap.set(p.tgtId, [])
      tgtMap.get(p.tgtId)!.push(p.srcId)
    })

    tgtMap.forEach((srcIds, tgtId) => {
      if (srcIds.length < 2) return
      const tgt  = effectiveNodeMap.get(tgtId)
      const srcs = srcIds
        .map(id => effectiveNodeMap.get(id))
        .filter((n): n is NodeLayout => !!n)
      if (!tgt || srcs.length < 2) return

      // 台形 4 頂点: src 側 2 境界点 + tgt 側 2 境界点
      const p1 = boundaryPt(srcs[0], tgt.x, tgt.y)
      const p2 = boundaryPt(srcs[1], tgt.x, tgt.y)
      const p3 = boundaryPt(tgt, srcs[1].x, srcs[1].y)
      const p4 = boundaryPt(tgt, srcs[0].x, srcs[0].y)
      const pts = `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`

      mlagPolys.push(
        <polygon key={`mlag-conv-${lagId}-${tgtId}`}
          className={fogCls([...srcIds, tgtId])}
          points={pts}
          fill={amberFill}
          stroke={amber} strokeWidth={0.6} strokeLinejoin="round"
          style={{ pointerEvents: 'none' }} />
      )
    })
  })

  return <>{lacpBands}{mlagPolys}</>
})
