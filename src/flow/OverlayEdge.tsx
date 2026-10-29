/**
 * OverlayEdge — L2/L3/BGP/attaches_to のオーバーレイエッジ
 *
 * 曲線 (quadratic bezier) で L1 リンクと視覚的に区別する。
 * 表示は opacity フェード。ラベルは YAML に書かれた値から出す（routing_adjacency は type）。
 */
import { memo } from 'react'
import { useInternalNode, useStore, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { edgeGeometry } from './edgeGeometry'
import { EDGE_COLOR } from './palette'
import { useFlowCtx, lodOf, type Lod } from './FlowCtx'
import type { CyEdgeData, OverlayKey } from '../types/topology'

const lodSelector = (s: { transform: [number, number, number] }): Lod => lodOf(s.transform[2])

const KIND_OF: Record<string, OverlayKey | 'always'> = {
  routing_adjacency: 'l3',
  bgp_session: 'bgp',
  vlan_member: 'l2',
  attaches_to: 'always',
}

/** routing_adjacencies[].type の表示名。知らない値はそのまま大文字で出す */
const ADJ_LABEL: Record<string, string> = { bgp: 'BGP', ospf: 'OSPF', isis: 'IS-IS' }
const adjLabel = (t?: string): string => (t ? ADJ_LABEL[t] ?? t.toUpperCase() : '')

export const OverlayEdge = memo(function OverlayEdge({ source, target, data, selected }: EdgeProps) {
  const d = data as unknown as CyEdgeData
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const lod = useStore(lodSelector)
  const { overlays, hoveredId } = useFlowCtx()
  if (!sourceNode || !targetNode) return null

  const kind = KIND_OF[d.type]
  const visible = kind === 'always' || overlays.has(kind)

  const geo = edgeGeometry(sourceNode, targetNode)
  // ふくらみ付き曲線で L1 直線と区別
  const bow = d.type === 'bgp_session' ? 28 : 16
  const cpx = geo.mx + geo.px * bow, cpy = geo.my + geo.py * bow
  const path = `M ${geo.sx},${geo.sy} Q ${cpx},${cpy} ${geo.tx},${geo.ty}`

  let color: string = EDGE_COLOR.attach, dash = '5 5', sw = 1.4, label = ''
  if (d.type === 'routing_adjacency') {
    color = EDGE_COLOR.routing; dash = '8 4'; sw = 1.8; label = adjLabel(d.adj_type)
  } else if (d.type === 'bgp_session') {
    if (d.bgp_type === 'ebgp') { color = EDGE_COLOR.ebgp; dash = ''; sw = 2.2 }
    else { color = EDGE_COLOR.ibgp; dash = '8 4'; sw = 1.8 }
    label = d.label ?? ''
  } else if (d.type === 'vlan_member') {
    color = EDGE_COLOR.vlan; dash = '3 5'; sw = 1.6
  }

  const touches = hoveredId !== null && (source === hoveredId || target === hoveredId)
  const dim = hoveredId !== null && !touches
  const showLabel = (lod === 'near' || lod === 'detail') && label
  const showBfd = lod === 'detail' && d.type === 'bgp_session' && d.bfd

  return (
    <g className={`ov-edge${visible ? '' : ' is-hidden'}${dim ? ' is-dim' : ''}${selected ? ' is-selected' : ''}`}>
      <path d={path} stroke={color} strokeWidth={sw}
        strokeDasharray={dash || undefined} strokeLinecap="round" fill="none"
        className="ov-line" />
      <path d={path} stroke="transparent" strokeWidth={14} fill="none"
        className="react-flow__edge-interaction" />

      <EdgeLabelRenderer>
        {visible && showLabel && (
          <div className={`edge-pill ov-pill${dim ? ' is-dim' : ''}`}
            style={{ transform: `translate(-50%,-50%) translate(${cpx}px,${cpy}px)`,
              '--pill-accent': color } as React.CSSProperties}>
            {label}
            {showBfd ? <span className="bfd-tag">BFD</span> : null}
          </div>
        )}
      </EdgeLabelRenderer>
    </g>
  )
})
