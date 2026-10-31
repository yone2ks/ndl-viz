/**
 * OverlayEdge — L2/L3/BGP/attaches_to のオーバーレイエッジ
 *
 * 曲線 (quadratic bezier) で L1 リンクと視覚的に区別する。
 * 表示は opacity フェード。ラベルは YAML に書かれた値から出す（routing_adjacency は type）。
 * BGP は機器の組ごとに 1 本（bgp_pair。layout.ts）で、札は eBGP / iBGP。AS は機器カードに出す。
 */
import { memo } from 'react'
import { useInternalNode, useStore, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { edgeGeometry } from './edgeGeometry'
import { OVERLAY_STYLE, type LineStyle } from './palette'
import { useFlowCtx, lodOf, type Lod } from './FlowCtx'
import type { CyEdgeData, OverlayKey, BgpPairProcess } from '../types/topology'

const lodSelector = (s: { transform: [number, number, number] }): Lod => lodOf(s.transform[2])

const KIND_OF: Record<string, OverlayKey | 'always'> = {
  routing_adjacency: 'l3',
  bgp_pair: 'bgp',
  vlan_member: 'l2',
  attaches_to: 'always',
}

/** routing_adjacencies[].type の表示名。知らない値はそのまま大文字で出す */
const ADJ_LABEL: Record<string, string> = { bgp: 'BGP', ospf: 'OSPF', isis: 'IS-IS' }
const adjLabel = (t?: string): string => (t ? ADJ_LABEL[t] ?? t.toUpperCase() : '')

const BGP_TYPE_LABEL: Record<string, string> = { ebgp: 'eBGP', ibgp: 'iBGP' }

/**
 * BGP の組の線の見た目と札。札は eBGP / iBGP（両方あれば並べる）。protocols.bgp に書かれていなければ BGP。
 * 隣接（routing_adjacencies）がプロセスより多ければ数を添える（VRF ごとのセッション等。どれが
 * どのプロセスかは書かれていないので、数だけ）
 */
function bgpPairLook(procs: BgpPairProcess[], adjacencies: number): { style: LineStyle; label: string } {
  const types = [...new Set(procs.map(p => p.type).filter((x): x is string => !!x))]
  const style = types.includes('ebgp') ? OVERLAY_STYLE.ebgp
    : types.includes('ibgp') ? OVERLAY_STYLE.ibgp : OVERLAY_STYLE.routing
  const name = types.length ? types.map(x => BGP_TYPE_LABEL[x] ?? x).join(' · ') : 'BGP'
  return { style, label: adjacencies > Math.max(procs.length, 1) ? `${name} ×${adjacencies}` : name }
}

export const OverlayEdge = memo(function OverlayEdge({ source, target, data, selected }: EdgeProps) {
  const d = data as unknown as CyEdgeData
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const lod = useStore(lodSelector)
  const { overlays, hoveredId, hiddenBgpRoles } = useFlowCtx()
  if (!sourceNode || !targetNode) return null

  const kind = KIND_OF[d.type]
  // BGP は凡例で外した役割のプロセスを除く。プロセスが書かれていない組（隣接だけ）は役割で絞らない
  const allProcs = d.bgp_processes ?? []
  const procs = allProcs.filter(p => !hiddenBgpRoles.has(p.role ?? ''))
  const visible = kind === 'always'
    || (overlays.has(kind) && !(d.type === 'bgp_pair' && allProcs.length > 0 && procs.length === 0))

  const geo = edgeGeometry(sourceNode, targetNode)
  // ふくらみ付き曲線で L1 直線と区別
  const bow = d.type === 'bgp_pair' ? 28 : 16
  const cpx = geo.mx + geo.px * bow, cpy = geo.my + geo.py * bow
  const path = `M ${geo.sx},${geo.sy} Q ${cpx},${cpy} ${geo.tx},${geo.ty}`

  let style: LineStyle = OVERLAY_STYLE.attach, label = ''
  if (d.type === 'routing_adjacency') {
    style = OVERLAY_STYLE.routing; label = adjLabel(d.adj_type)
  } else if (d.type === 'bgp_pair') {
    ({ style, label } = bgpPairLook(procs, d.routing_adjacencies?.length ?? 0))
  } else if (d.type === 'vlan_member') {
    style = OVERLAY_STYLE.vlan
  }
  const { color, dash, width: sw } = style

  const touches = hoveredId !== null && (source === hoveredId || target === hoveredId)
  const dim = hoveredId !== null && !touches
  const showLabel = (lod === 'near' || lod === 'detail') && label
  const showBfd = lod === 'detail' && procs.some(p => p.bfd)

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
