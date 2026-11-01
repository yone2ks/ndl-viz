/**
 * VxlanTunnels — フォーカス中の VNI に参加する機器を、VNI の札からの 1 本の母線で結ぶ (L2 overlay)
 *
 * トンネルはエンティティではなく (ADR-0014)、VNI ごとにも分かれない。VTEP の組ごとの線は「その組で張っている」ように
 * 読めるので描かず、VNI を 1 つの札にして、L2VNI も L3VNI も参加する機器へ線を落とす。
 * 参加する機器は mlndl の VNI.vteps から導く。共有 VTEP は終端するノードそれぞれに落とす。
 * 線は札から横に出て、角を丸めて機器の上端へ下りる。
 */
import { memo } from 'react'
import { ViewportPortal, useNodes, type Node } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import { CARD_W, CARD_H } from './layout'
import type { CyNodeData } from '../types/topology'

const R = 7   // 管の半径
/** 母線の高さ（機器の上端から）。上の段のカードまでに収まらなければ低くする */
const RAIL_MAX = 96, RAIL_MIN = 36
/** 札の中心と、上の段のカードの間にあける余白 */
const RAIL_TOP_GAP = 40
/** 4 分円を 3 次ベジェで描くときの係数 */
const KAPPA = 0.55

/** 札 (hx, y) から機器の上端 (fx, fy) までの線。r は角の丸みの半径 */
function branch(hx: number, y: number, fx: number, fy: number, r: number): string {
  const dx = fx - hx
  if (Math.abs(dx) < 1) return `M ${hx},${y} L ${fx},${fy}`
  // 札のすぐ下の機器は横に出す余地がないので、S 字でつなぐ
  if (Math.abs(dx) < r) {
    const my = (y + fy) / 2
    return `M ${hx},${y} C ${hx},${my} ${fx},${my} ${fx},${fy}`
  }
  const s = Math.sign(dx), k = r * (1 - KAPPA)
  return `M ${hx},${y} L ${fx - s * r},${y} C ${fx - s * k},${y} ${fx},${y + k} ${fx},${y + r} L ${fx},${fy}`
}

const vniLabel = (v: CyNodeData) => (v.type === 'l3vni' ? `L3VNI ${v.vni}` : `VNI ${v.vni}`)

export const VxlanTunnels = memo(function VxlanTunnels() {
  const nodes = useNodes()
  const { overlays, focusVniId, vniById, vtepNodes, vlanHue } = useFlowCtx()
  const vni = focusVniId ? vniById.get(focusVniId) : undefined
  if (!vni || !overlays.has('l2')) return null

  const byId = new Map(nodes.map(n => [n.id, n]))
  const members = [...new Set(((vni.vteps ?? []) as string[]).flatMap(v => vtepNodes.get(v) ?? []))]
    .map(id => byId.get(id)).filter((n): n is Node => !!n)
  if (members.length === 0) return null

  const color = vni.type === 'l3vni'
    ? '#8b5cf6'
    : `hsl(${vlanHue.get(vni.vlan ?? '') ?? 170}, 70%, 48%)`
  const heightOf = (n: Node) => n.measured?.height ?? CARD_H
  const feet = members.map(n => ({ x: n.position.x + (n.measured?.width ?? CARD_W) / 2, y: n.position.y }))
  const top = Math.min(...feet.map(f => f.y))
  // 母線の上に使える高さ: 機器の上端から、その上にある機器のカードの下端まで
  const room = top - Math.max(-Infinity, ...nodes
    .filter(n => n.type === 'device' && n.position.y + heightOf(n) < top)
    .map(n => n.position.y + heightOf(n)))
  const rail = Math.max(RAIL_MIN, Math.min(RAIL_MAX, room - RAIL_TOP_GAP))
  const y = top - rail
  const hx = (Math.min(...feet.map(f => f.x)) + Math.max(...feet.map(f => f.x))) / 2
  // 1 つの path にまとめる（重なる部分の透明度が濃くならず、破線の位置もそろう）
  const d = feet.map(f => branch(hx, y, f.x, f.y, rail)).join(' ')
  const about = vni.type === 'l3vni' ? vni.vrf : vni.vlan

  return (
    <ViewportPortal>
      <svg className="vx-tunnels" width="1" height="1"
        style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <g style={{ '--vx': color } as React.CSSProperties} fill="none">
          <path className="vx-shell" d={d} strokeWidth={R * 2} />
          <path className="vx-core" d={d} />
          {feet.map((f, i) => <circle key={i} className="vx-end" cx={f.x} cy={f.y} r={R + 2} />)}
        </g>
      </svg>
      <div className="vx-pill" onClick={e => e.stopPropagation()}
        style={{ transform: `translate(-50%, -50%) translate(${hx}px, ${y}px)`,
          '--vx': color } as React.CSSProperties}>
        <span className="vx-pill-main">VXLAN · {vniLabel(vni)}</span>
        {about && <span className="vx-pill-sub">{about}</span>}
      </div>
    </ViewportPortal>
  )
})
