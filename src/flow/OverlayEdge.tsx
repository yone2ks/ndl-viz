/**
 * OverlayEdge — L2 / 制御プレーン / attaches_to のオーバーレイエッジ
 *
 * 曲線 (quadratic bezier) で L1 リンクと視覚的に区別する。表示は opacity フェード。
 * 制御プレーンは 1 セッション = 1 本 (routing_neighbor。ADR-0010 D11)。中央の札は eBGP / iBGP と運ぶ AF、
 * 通り道が bridge・トンネルなら中央の札にその名前を添える (ADR-0018 D5)。
 * 両端の札はその端の AS とアドレス。拡大したとき・線を選んだときは両端、機器に載せたときはその機器の側だけ出す。
 * 同じ機器の組の複数のセッションは、ふくらみを変えて重ならないようにする。
 * 間に別の機器のカードがあるセッションは、カードの下を回る弧で描く。
 */
import { memo } from 'react'
import { useInternalNode, useStore, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { edgeGeometry, arcGeometry } from './edgeGeometry'
import { OVERLAY_STYLE, type LineStyle } from './palette'
import { useFlowCtx, lodOf, type Lod } from './FlowCtx'
import { afsHidden, endLabel, overlayOf, sessionLabel, sessionStyle } from './session'
import { useT } from '../i18n'
import type { CyEdgeData } from '../types/topology'

const lodSelector = (s: { transform: [number, number, number] }): Lod => lodOf(s.transform[2])

/** 同じ組の n 本目のセッションのふくらみ。1 本目が L1 の直線にいちばん近い。中央の札が重ならない間隔 (札の位置はふくらみの半分ずれる) */
const SESSION_BOW = 28, SESSION_BOW_STEP = 50

export const OverlayEdge = memo(function OverlayEdge({ source, target, data, selected }: EdgeProps) {
  const d = data as unknown as CyEdgeData & {
    offsetIndex?: number; crossing?: string; crossingNodes?: string[]; detour?: boolean }
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const lod = useStore(lodSelector)
  const t = useT()
  const { overlays, hoveredId, hiddenAfs, vniFocusNodes } = useFlowCtx()
  if (!sourceNode || !targetNode) return null

  const kind = overlayOf(d)
  const session = d.type === 'routing_neighbor'
  const visible = kind === 'always' || (kind !== null && overlays.has(kind) && !afsHidden(d, hiddenAfs))

  // 間の機器のカードを突き抜けるセッションは、カードの下を回る弧で描く (札がカードに隠れないように)
  const arc = session && d.detour
    ? arcGeometry(sourceNode, targetNode, d.offsetIndex ?? 0, 1, SESSION_BOW_STEP / 2, true) : null
  const geo = arc ?? edgeGeometry(sourceNode, targetNode)
  // ふくらみ付き曲線で L1 直線と区別
  const bow = session ? SESSION_BOW + (d.offsetIndex ?? 0) * SESSION_BOW_STEP : 16
  const cpx = geo.mx + geo.px * bow, cpy = geo.my + geo.py * bow
  const path = arc?.path ?? `M ${geo.sx},${geo.sy} Q ${cpx},${cpy} ${geo.tx},${geo.ty}`
  // 曲線上の点 (端の札の位置)
  const at = arc?.at ?? ((u: number) => ({
    x: (1 - u) ** 2 * geo.sx + 2 * (1 - u) * u * cpx + u ** 2 * geo.tx,
    y: (1 - u) ** 2 * geo.sy + 2 * (1 - u) * u * cpy + u ** 2 * geo.ty,
  }))
  const mid = at(0.5)

  let style: LineStyle = OVERLAY_STYLE.attach, label = ''
  if (session) {
    style = sessionStyle(d); label = sessionLabel(d)
  } else if (d.type === 'vlan_member') {
    style = OVERLAY_STYLE.vlan
  }
  const { color, dash, width: sw } = style

  // L3VNI のフォーカスでは、残す VLAN が複数ある
  // 事業者網の箱に載せたときは、その箱の bridge を通るセッションも残す (ADR-0018 D5)
  const touches = hoveredId !== null && (source === hoveredId || target === hoveredId
    || (d.type === 'vlan_member' && !!vniFocusNodes?.has(source))
    || !!d.crossingNodes?.includes(hoveredId))
  const dim = hoveredId !== null && !touches
  const showLabel = (lod === 'near' || lod === 'detail') && label
  const showBfd = lod === 'detail' && d.bfd
  // 端の札: 拡大したとき・選んだときは両端、機器に載せたときはその機器の側だけ
  // (1 台から多くのセッションが出るので、両端を出すと機器のまわりに札が重なる)
  const bothEnds = session && (lod === 'detail' || !!selected)
  const ends = !session ? [] : ([[d.from, at(0.22), source], [d.to, at(0.78), target]] as const)
    .filter(([, , node]) => bothEnds || hoveredId === node)
    .map(([end, p]) => ({ text: d.protocol === 'bgp' ? endLabel(end, t.unnumbered) : end?.interface_name ?? '', p }))
    .filter(e => e.text)

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
            style={{ transform: `translate(-50%,-50%) translate(${mid.x}px,${mid.y}px)`,
              '--pill-accent': color } as React.CSSProperties}>
            {label}
            {d.crossing ? <span className="crossing-tag">{t.crossing(d.crossing)}</span> : null}
            {showBfd ? <span className="bfd-tag">BFD</span> : null}
          </div>
        )}
        {visible && ends.map((e, i) => (
          <div key={i} className={`edge-if session-end${dim ? ' is-dim' : ''}`}
            style={{ transform: `translate(-50%,-50%) translate(${e.p.x}px,${e.p.y}px)`,
              '--pill-accent': color } as React.CSSProperties}>
            {e.text}
          </div>
        ))}
      </EdgeLabelRenderer>
    </g>
  )
})
