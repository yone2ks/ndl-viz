/**
 * OverlayEdges — attaches_to / L3 routing / BGP / L2 VLAN member エッジ
 *
 * 全エッジを常時レンダリングし、表示は opacity で切り替える（フェードトランジション）。
 * mount/unmount しないことでトグル時の dagre 再計算も発生しない。
 * Flow ON のとき bgp_session に stroke-dashoffset アニメーションのフローを重ねる。
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import { edgePts } from '../geometry'
import { isOverlayEdgeVisible, type NodeLayout } from '../layout'
import type { CyEdgeData } from '../../../types/topology'

interface Props {
  overlayEdges: CyEdgeData[]
  effectiveNodeMap: Map<string, NodeLayout>
  vlanMap: Map<string, NodeLayout>
}

export const OverlayEdges = memo(function OverlayEdges({ overlayEdges, effectiveNodeMap, vlanMap }: Props) {
  const { overlays, onSelect, hoveredId, lod } = useGraphCtx()
  const showLabel = lod === 'near' || lod === 'detail'
  const showBfd   = lod === 'detail'
  return (
    <>
      {overlayEdges.map(d => {
        const visible = isOverlayEdgeVisible(d, overlays)
        // vlan_member: source = VLAN node（vlanMap）, target = L1 node
        const src = effectiveNodeMap.get(d.source)
          ?? (d.type === 'vlan_member' ? vlanMap.get(d.source) : undefined)
        const tgt = effectiveNodeMap.get(d.target)
        if (!src || !tgt) return null
        const pts = edgePts(src, tgt, 0, 1)
        const dim = hoveredId !== null && d.source !== hoveredId && d.target !== hoveredId

        let stroke = '#374151', dash = '5 4', sw = 1.2, marker = 'url(#arr-gray)', label = ''
        if (d.type === 'routing_adjacency') {
          stroke = '#059669'; dash = '9 3'; sw = 2; marker = 'url(#arr-green)'
          label = 'routing adj'
        } else if (d.type === 'bgp_session') {
          if (d.bgp_type === 'ebgp') {
            stroke = '#EA580C'; dash = ''; sw = 2.5; marker = 'url(#arr-orange)'
            label = d.label ?? ''
          } else {
            stroke = '#7C3AED'; dash = '9 3'; sw = 1.8; marker = 'url(#arr-purple)'
            label = d.label ?? ''
          }
        } else if (d.type === 'vlan_member') {
          stroke = '#F59E0B'; dash = '3 3'; sw = 1.5; marker = 'url(#arr-amber)'
        }

        return (
          <g key={d.id}
             className={`clickable ov-able${visible ? '' : ' ov-off'}${dim ? ' fog-dim' : ''}`}
             style={{ cursor:'pointer' }}
             onClick={e => { e.stopPropagation(); onSelect({ data: d }) }}>
            <line x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
              stroke={stroke} strokeWidth={sw}
              strokeDasharray={dash || undefined} markerEnd={marker} />
            {showLabel && label && (
              <text x={pts.mx + pts.py * 10} y={pts.my - pts.px * 10}
                fill={stroke} fontSize={8} textAnchor="middle" className="lod-fade"
                style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
                {label}
              </text>
            )}
            {/* BFD バッジ（detail のみ）*/}
            {showBfd && d.type === 'bgp_session' && d.bfd && (
              <g className="lod-fade" style={{ pointerEvents:'none' }}>
                <rect x={pts.mx - pts.py * 14 - 14} y={pts.my + pts.px * 14 - 6}
                  width={28} height={12} rx={3}
                  fill="rgba(124,58,237,0.15)" stroke={stroke} strokeWidth={0.8} />
                <text x={pts.mx - pts.py * 14} y={pts.my + pts.px * 14 + 1}
                  fill={stroke} fontSize={7} fontWeight={700} textAnchor="middle" dominantBaseline="middle"
                  style={{ fontFamily:'"SF Mono",monospace' }}>
                  BFD
                </text>
              </g>
            )}
          </g>
        )
      })}
    </>
  )
})
