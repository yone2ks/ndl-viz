/**
 * StackView — 2.5D レイヤースタックビュー
 *
 * L1 物理 / L2 VLAN / L3 Routing+BGP の 3 平面を斜めに積み、
 * 同一ノードを縦の supporting 線で接続する (RFC 8345 supporting-node の可視化)。
 * ホバーしたノードの縦串だけ強調表示する。
 *
 * マウント直後に identity → stack 変換へ CSS transition でモーフィングする。
 */
import { memo, useEffect, useState } from 'react'
import { useGraphCtx } from '../GraphContext'
import { planeMatrix, toPlane } from '../utils/planeTransform'
import { prefersReducedMotion } from '../utils/animate'
import { rcfg, LINK_COLOR, LAG_COLOR } from '../theme'
import type { LayoutResult, NodeLayout } from '../layout'

interface Props {
  layout: LayoutResult
  effectiveNodeMap: Map<string, NodeLayout>
}

const PLANE_LABEL = ['L1 Physical', 'L2 VLAN / VxLAN', 'L3 Routing / BGP']

export const StackView = memo(function StackView({ layout, effectiveNodeMap }: Props) {
  const { theme, ui, hoveredId, setHoveredId, onSelect } = useGraphCtx()
  const { pairMap, vlanLayouts, vlanMembers, overlayEdges, graphW, graphH } = layout

  // マウント後 1 フレームで identity → stack 変換（CSS transition モーフィング）
  const [engaged, setEngaged] = useState(prefersReducedMotion())
  useEffect(() => {
    if (engaged) return
    const id = requestAnimationFrame(() => setEngaged(true))
    return () => cancelAnimationFrame(id)
  }, [engaged])

  const nodes = [...effectiveNodeMap.values()]
  const planeStyle = (plane: number): React.CSSProperties => ({
    transform: engaged ? planeMatrix(plane, graphH) : 'matrix(1,0,0,1,0,0)',
    transition: 'transform 300ms ease-out',
  })
  const panelStroke = theme === 'dark' ? 'rgba(124,140,248,0.35)' : 'rgba(79,95,219,0.30)'
  const panelFill   = theme === 'dark' ? 'rgba(124,140,248,0.05)' : 'rgba(79,95,219,0.04)'
  const ghost       = theme === 'dark' ? 'rgba(226,232,240,0.25)' : 'rgba(30,41,59,0.22)'
  const PAD = 60

  // L2 平面に出すノード = VLAN メンバー、L3 平面 = lo_ip / routing 参加ノード
  const l2NodeIds = new Set([...vlanMembers.values()].flat())
  const l3Edges = overlayEdges.filter(d => d.type === 'routing_adjacency' || d.type === 'bgp_session')
  const l3NodeIds = new Set([
    ...nodes.filter(n => n.data.lo_ip).map(n => n.id),
    ...l3Edges.flatMap(d => [d.source, d.target]),
  ])

  // 平面パネル（共通枠）
  const Panel = ({ plane }: { plane: number }) => (
    <>
      <rect x={-PAD} y={-PAD} width={graphW + PAD * 2} height={graphH + PAD * 2} rx={18}
        fill={panelFill} stroke={panelStroke} strokeWidth={1.5} />
      <text x={-PAD + 14} y={-PAD - 12}
        fill={panelStroke} fontSize={20} fontWeight={700}
        style={{ fontFamily:'"SF Mono",monospace', letterSpacing:'0.08em' }}>
        {PLANE_LABEL[plane]}
      </text>
    </>
  )

  // ノードゴースト（平面共通の簡略矩形）
  const Ghost = ({ n, sub, plane }: { n: NodeLayout; sub?: string; plane: number }) => {
    const cfg = rcfg(n.data.role, theme)
    const active = hoveredId === n.id
    return (
      <g className="clickable" style={{ cursor:'pointer' }}
         onMouseEnter={() => setHoveredId(n.id)}
         onMouseLeave={() => setHoveredId(null)}
         onClick={e => { e.stopPropagation(); onSelect({ data: n.data }) }}>
        <rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx={8}
          fill={plane === 0 ? cfg.fill : 'transparent'}
          stroke={active ? cfg.stroke : plane === 0 ? cfg.stroke : ghost}
          strokeWidth={active ? 2.6 : 1.6} />
        <text x={n.x} y={n.y - 2} textAnchor="middle" dominantBaseline="middle"
          fill={plane === 0 ? ui.labelText : ghost} fontSize={13} fontWeight={600}
          style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
          {n.data.label}
        </text>
        {sub && (
          <text x={n.x} y={n.y + 13} textAnchor="middle" dominantBaseline="middle"
            fill={ui.labelDim} fontSize={10}
            style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
            {sub}
          </text>
        )}
      </g>
    )
  }

  return (
    <g className="lod-enter">
      {/* ── 層間 supporting 線（ホバーで縦串強調）── */}
      {engaged && nodes.map(n => {
        const planes = [0, ...(l2NodeIds.has(n.id) ? [1] : []), ...(l3NodeIds.has(n.id) ? [2] : [])]
        if (planes.length < 2) return null
        const active = hoveredId === n.id
        const segs = []
        for (let i = 0; i < planes.length - 1; i++) {
          const a = toPlane(planes[i], n.x, n.y, graphH)
          const b = toPlane(planes[i + 1], n.x, n.y, graphH)
          segs.push(
            <line key={`sup-${n.id}-${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? '#F59E0B' : ghost}
              strokeWidth={active ? 2.4 : 1}
              strokeDasharray="4 6"
              style={{ transition: 'stroke 180ms, stroke-width 180ms' }} />
          )
        }
        return segs
      })}

      {/* ── Plane 0: L1 Physical ── */}
      <g style={planeStyle(0)}>
        <Panel plane={0} />
        {Array.from(pairMap.values()).map(links => links.map(d => {
          const src = effectiveNodeMap.get(d.source)!, tgt = effectiveNodeMap.get(d.target)!
          const isLag = !!d.lag_id
          const color = isLag ? LAG_COLOR.line
            : (LINK_COLOR[d.link_role ?? ''] ?? ui.linkDefault)
          return (
            <line key={`stk-l1-${d.id}`} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke={color} strokeWidth={isLag ? 2.4 : 1.8} opacity={0.8} />
          )
        }))}
        {nodes.map(n => <Ghost key={n.id} n={n} plane={0} />)}
      </g>

      {/* ── Plane 1: L2 VLAN ── */}
      <g style={planeStyle(1)}>
        <Panel plane={1} />
        {/* VLAN ピル + メンバー線 */}
        {vlanLayouts.map(vn => (
          <g key={`stk-vlan-${vn.id}`}>
            {(vlanMembers.get(vn.id) ?? []).map(mid => {
              const m = effectiveNodeMap.get(mid)
              if (!m) return null
              return <line key={`stk-vm-${vn.id}-${mid}`}
                x1={vn.x} y1={vn.y} x2={m.x} y2={m.y}
                stroke="#F59E0B" strokeWidth={1.4} strokeDasharray="4 4" opacity={0.7} />
            })}
            <rect x={vn.x - vn.w / 2} y={vn.y - 24} width={vn.w} height={48} rx={10}
              fill={theme === 'dark' ? 'rgba(245,158,11,0.12)' : 'rgba(180,83,9,0.08)'}
              stroke="#F59E0B" strokeWidth={1.6} />
            <text x={vn.x} y={vn.y + 2} textAnchor="middle" dominantBaseline="middle"
              fill="#F59E0B" fontSize={13} fontWeight={700}
              style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
              {vn.data.label?.split('\n')[0] ?? vn.id}
            </text>
          </g>
        ))}
        {nodes.filter(n => l2NodeIds.has(n.id)).map(n =>
          <Ghost key={n.id} n={n} plane={1} sub={n.data.vlans?.join(' ')} />)}
      </g>

      {/* ── Plane 2: L3 Routing / BGP ── */}
      <g style={planeStyle(2)}>
        <Panel plane={2} />
        {l3Edges.map(d => {
          const src = effectiveNodeMap.get(d.source), tgt = effectiveNodeMap.get(d.target)
          if (!src || !tgt) return null
          const isBgp = d.type === 'bgp_session'
          const stroke = isBgp ? (d.bgp_type === 'ebgp' ? '#EA580C' : '#7C3AED') : '#059669'
          return (
            <line key={`stk-l3-${d.id}`} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke={stroke} strokeWidth={1.8}
              strokeDasharray={isBgp && d.bgp_type !== 'ebgp' ? '8 4' : undefined} opacity={0.85} />
          )
        })}
        {nodes.filter(n => l3NodeIds.has(n.id)).map(n =>
          <Ghost key={n.id} n={n} plane={2} sub={n.data.lo_ip} />)}
      </g>
    </g>
  )
})
