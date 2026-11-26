/**
 * VxlanTunnels — フォーカス中の VNI に参加する機器を、VNI の札からの 1 本の母線で結ぶ (L2 overlay)
 *
 * トンネルはエンティティではなく (ADR-0014)、VNI ごとにも分かれない。VTEP の組ごとの線は「その組で張っている」ように
 * 読めるので描かず、VNI を 1 つの札にして、L2VNI も L3VNI も参加する機器へ線を落とす。
 * 参加する機器は mlndl の VNI.vteps から導く。共有 VTEP は終端するノードそれぞれに落とす。
 * 線は札から横に出て、角を丸めて機器の上端へ下りる。
 *
 * オーバーレイのドメインを書いた YAML (mlndl ADR-0029) では、VNI の tunnel_pairs をドメインごとにまとめ、ドメインごとに
 * 母線を 1 本引く (ドメインの中はフルメッシュなので、1 本の母線で読める)。EVPN Multi-Site なら、サイトの中の母線が 2 本と
 * DCI の母線が 1 本になり、BGW には 2 本が下りる。ドメインをまたぐ VTEP の対は結ばない。tunnel_pairs がなければ
 * vteps 全体を 1 本で結ぶ (今までどおり)。母線が横に重なるときは高さをずらし、同じ機器に下りる線は足もとを左右にずらす。
 *
 * L2VNI は、機器によって番号の違う VLAN を載せられる (mlndl ADR-0026)。線の足もとに、その機器の VLAN を
 * mlndl の node_vlans のとおりに添える。node_vlans に出てこない参加機器 (BGW など) は VLAN が書かれていないので、
 * 「VLAN なし」と添えて推定では埋めない。VLAN のポートや SVI から導き直さない。
 */
import { memo } from 'react'
import { ViewportPortal, useNodes, type Node } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import { useT } from '../i18n'
import { CARD_W, CARD_H } from './layout'
import type { CyNodeData, TunnelPair } from '../types/topology'

const R = 7   // 管の半径
/** 母線の高さ（機器の上端から）。上の段のカードまでに収まらなければ低くする */
const RAIL_MAX = 96, RAIL_MIN = 36
/** 札の中心と、上の段のカードの間にあける余白 */
const RAIL_TOP_GAP = 40
/** 高さをずらした母線どうしの間隔の下限 */
const LEVEL_GAP = 28
/** 1 台に 2 本以上の母線が下りるときの、足もとの間隔 */
const FOOT_SPREAD = 22
/** 母線の重なりを見るときに、札の分として左右に足す幅 */
const PILL_HALF_W = 90
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

/** 母線 1 本分の VTEP。domain はドメインを書いた YAML だけ */
interface BusVteps { domain?: string; vteps: string[] }

/** tunnel_pairs をドメインごとにまとめる (出てきた順)。tunnel_pairs がなければ vteps 全体を 1 本に */
function busesOf(vni: CyNodeData): BusVteps[] {
  if (!vni.tunnel_pairs) return [{ vteps: (vni.vteps ?? []) as string[] }]
  const byDomain = new Map<string, Set<string>>()
  vni.tunnel_pairs.forEach((p: TunnelPair) => {
    if (!byDomain.has(p.overlay_domain)) byDomain.set(p.overlay_domain, new Set())
    p.endpoints.forEach(v => byDomain.get(p.overlay_domain)!.add(v))
  })
  return [...byDomain].map(([domain, vteps]) => ({ domain, vteps: [...vteps] }))
}

/** 横の範囲が重なる母線を別の段に置く。狭い母線ほど低い段 (0 がいちばん低い)。戻り値は母線ごとの段と段の数 */
function levelsOf(spans: [number, number][]): { level: number[]; count: number } {
  const level = new Array<number>(spans.length).fill(0)
  const placed: [number, number][][] = []
  spans.map((_, i) => i).sort((a, b) => (spans[a][1] - spans[a][0]) - (spans[b][1] - spans[b][0])).forEach(i => {
    const [l, r] = spans[i]
    let k = placed.findIndex(row => row.every(([pl, pr]) => r < pl || pr < l))
    if (k < 0) { k = placed.length; placed.push([]) }
    placed[k].push(spans[i])
    level[i] = k
  })
  return { level, count: Math.max(1, placed.length) }
}

export const VxlanTunnels = memo(function VxlanTunnels() {
  const nodes = useNodes()
  const t = useT()
  const { overlays, focusVniId, vniById, vlanById, vtepNodes, vlanHue, vrfL3vni, overlayDomainLabel } = useFlowCtx()
  // VNI のタブを選んだときと、L3VNI を持つ VRF を選んだとき。
  // VNI のタブは VLAN カード (Layer 2) にあり、VRF のバッジは Layer 3 で出るので、VRF からはどちらの層でも描く
  const vni = focusVniId ? vniById.get(focusVniId) : vrfL3vni ?? undefined
  const shown = focusVniId ? overlays.has('l2') : overlays.has('l2') || overlays.has('l3')
  if (!vni || !shown) return null

  const byId = new Map(nodes.map(n => [n.id, n]))
  const heightOf = (n: Node) => n.measured?.height ?? CARD_H
  const centerX = (n: Node) => n.position.x + (n.measured?.width ?? CARD_W) / 2
  const buses = busesOf(vni).map(b => {
    const members = [...new Set(b.vteps.flatMap(v => vtepNodes.get(v) ?? []))]
      .map(id => byId.get(id)).filter((n): n is Node => !!n)
    return { ...b, members }
  }).filter(b => b.members.length > 0)
  if (buses.length === 0) return null

  const vlans = vni.type === 'l2vni' ? vni.vlans ?? [] : []
  // VLAN が 1 つなら VLAN の札と同じ色。番号の違う VLAN を載せるときは、どの VLAN の色でもない色にする
  const color = vni.type === 'l3vni'
    ? '#8b5cf6'
    : `hsl(${(vlans.length === 1 ? vlanHue.get(vlans[0]) : undefined) ?? 170}, 70%, 48%)`
  // 機器 → その機器の VLAN (L2VNI だけ。mlndl が導いた値)
  const vlanOfNode = new Map((vni.type === 'l2vni' ? vni.node_vlans ?? [] : []).map(nv => [nv.node, nv.vlan]))
  // ポートのない VLAN (SVI だけで参加する機器の VLAN) は札がないので、図のノードではなく VLAN の一覧から番号を引く
  const vlanLabel = (vlanId: string) => {
    const num = vlanById.get(vlanId)?.vlan_id
    return num !== undefined ? `VLAN ${num}` : vlanId
  }
  const about = vni.type === 'l3vni' ? vni.vrf : vlans.join(' · ')

  // 1 台に下りる母線の数と、その中の何本目か (足もとを左右にずらす)
  const busesAt = new Map<string, number[]>()
  buses.forEach((b, i) => b.members.forEach(n => {
    if (!busesAt.has(n.id)) busesAt.set(n.id, [])
    busesAt.get(n.id)!.push(i)
  }))
  const footX = (n: Node, i: number) => {
    const at = busesAt.get(n.id)!
    return centerX(n) + (at.indexOf(i) - (at.length - 1) / 2) * FOOT_SPREAD
  }

  // 母線ごとの足もとと、上に使える高さ (機器の上端から、その上にある機器のカードの下端まで)
  const geo = buses.map((b, i) => {
    const feet = b.members.map(n => ({ x: footX(n, i), y: n.position.y }))
    const top = Math.min(...feet.map(f => f.y))
    const room = top - Math.max(-Infinity, ...nodes
      .filter(n => n.type === 'device' && n.position.y + heightOf(n) < top)
      .map(n => n.position.y + heightOf(n)))
    const xs = feet.map(f => f.x)
    return { feet, top, room, hx: (Math.min(...xs) + Math.max(...xs)) / 2,
      span: [Math.min(...xs) - PILL_HALF_W, Math.max(...xs) + PILL_HALF_W] as [number, number] }
  })
  const { level, count } = levelsOf(geo.map(g => g.span))
  const high = Math.max(RAIL_MIN + LEVEL_GAP * (count - 1),
    Math.min(RAIL_MAX, Math.min(...geo.map(g => g.room)) - RAIL_TOP_GAP))
  const railOf = (i: number) => count === 1 ? Math.max(RAIL_MIN, high) : RAIL_MIN + (high - RAIL_MIN) * level[i] / (count - 1)

  // 機器ごとの VLAN の札 (L2VNI だけ)。母線が 2 本下りる機器 (BGW) にも 1 つ
  const footLabels = vni.type === 'l2vni'
    ? [...busesAt.keys()].map(id => byId.get(id)!).map(n => ({ id: n.id, x: centerX(n), y: n.position.y }))
    : []

  return (
    <ViewportPortal>
      <svg className="vx-tunnels" width="1" height="1"
        style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <g style={{ '--vx': color } as React.CSSProperties} fill="none">
          {geo.map((g, i) => {
            const rail = railOf(i)
            // 母線ごとに 1 つの path にまとめる（重なる部分の透明度が濃くならず、破線の位置もそろう）
            const d = g.feet.map(f => branch(g.hx, g.top - rail, f.x, f.y, rail)).join(' ')
            return (
              <g key={i}>
                <path className="vx-shell" d={d} strokeWidth={R * 2} />
                <path className="vx-core" d={d} />
                {g.feet.map((f, j) => <circle key={j} className="vx-end" cx={f.x} cy={f.y} r={R + 2} />)}
              </g>
            )
          })}
        </g>
      </svg>
      {geo.map((g, i) => {
        const domain = buses[i].domain
        const sub = [domain && (overlayDomainLabel.get(domain) ?? domain), about].filter(Boolean).join(' · ')
        return (
          <div key={i} className="vx-pill" onClick={e => e.stopPropagation()}
            title={domain}
            style={{ transform: `translate(-50%, -50%) translate(${g.hx}px, ${g.top - railOf(i)}px)`,
              '--vx': color } as React.CSSProperties}>
            <span className="vx-pill-main">VXLAN · {vniLabel(vni)}</span>
            {sub && <span className="vx-pill-sub">{sub}</span>}
          </div>
        )
      })}
      {footLabels.map(f => {
        const vlanId = vlanOfNode.get(f.id)
        return (
          <div key={f.id} className={`vx-foot${vlanId ? '' : ' is-unwritten'}`} onClick={e => e.stopPropagation()}
            title={vlanId ? `${f.id}: ${vlanId}` : t.vniNoVlanTip(f.id)}
            style={{ transform: `translate(-50%, -100%) translate(${f.x}px, ${f.y - R - 4}px)`,
              '--vx': color } as React.CSSProperties}>
            {vlanId ? vlanLabel(vlanId) : t.vniNoVlan}
          </div>
        )
      })}
    </ViewportPortal>
  )
})
