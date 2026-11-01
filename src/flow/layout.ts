/**
 * flow/layout.ts — mlndl Cytoscape JSON → React Flow ノード/エッジ変換
 *
 * dagre で階層レイアウトを計算し、HTML カードノード前提のサイズで配置する。
 * 表示判定 (overlays) はここでは行わない — FlowGraph 側で hidden を切り替える。
 */
import * as Dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { TopologyData, CyNodeData, CyEdgeData, NodeVtep, VlanEndpointData } from '../types/topology'
import { l3Name, isVlanIf } from './l3'
import { cardHeight } from './cardSize'

export const CARD_W = 184
export const CARD_H = 92
/** VLAN の札（VLAN 番号 + サブネット）の高さ。押すとカードに広がるが、配置は札の大きさで決める */
export const VLAN_PILL_H = 26
const PILL_GAP_X = 10
const PILL_GAP_Y = 6
/** ポートを持ついちばん下の段のカード（いちばん高くなるときの高さ）の下端から、札の帯の上端まで */
const PILL_BAND_TOP = 34
/** 札の帯の下端から、次の段のカードの上端まで */
const PILL_BAND_BOTTOM = 50
/** 札の列の段数の上限（超える分は隣に列を足す）*/
const PILL_MAX_ROWS = 4
/** 札の帯がない段の、カードの下端から次の段のカードの上端まで */
const TIER_GAP = 150

export interface TierInfo {
  yTop: number; yBot: number; label: string; roles: Record<string, number>
  /** この段の下の VLAN の札の帯の下端（帯がなければ yBot）。段の区切り線はここと次の段の間に引く */
  yEnd: number
  xLeft: number; xRight: number   // この帯を描く X 範囲（サイト幅）
}

/** サイト境界ボックス */
export interface SiteInfo {
  id: number; label: string
  xLeft: number; yTop: number; xRight: number; yBot: number
}

/** リンク上を流れる VLAN のレール描画情報 */
export interface VlanRail { vlanId: string; vlanNum: number; hue: number }

/** VLAN の端点。via はその端点を受ける VLAN のポートのノード（端点はそのノードにローカル。ADR-0013 D7）*/
export type VlanEndpoint = VlanEndpointData & { via: string }

export interface FlowGraphData {
  nodes: Node[]
  edges: Edge[]
  tiers: TierInfo[]
  sites: SiteInfo[]
  mlagDomains: Map<string, string[]>     // lag_id → switch node ids
  vlanMembers: Map<string, string[]>     // vlan id → member node ids
  vniByVlan: Map<string, CyNodeData[]>
  vlanEndpoints: Map<string, Map<string, VlanEndpoint[]>>   // vlan id → (端点のノード id → 端点)
  vniById: Map<string, CyNodeData>
  vtepNodes: Map<string, string[]>       // vtep id → 終端する node ids（共有 VTEP は複数）
  vtepAddress: Map<string, string>       // vtep id → VTEP のアドレス
  adjacency: Map<string, Set<string>>
  vlanOnLink: Map<string, VlanRail[]>    // link edge id → そのリンクを通る VLAN
  vlanHue: Map<string, number>           // vlan id → 色相
  ifIp: Map<string, Map<string, string>> // node id → (IF 名 → IP)
  sviByVlan: Map<string, { node: string; label: string; ip: string }[]>
  graphW: number
  graphH: number
}

const TIER_LABEL: Record<string, string> = {
  spine:'Spine', core:'Core', aggregation:'Aggregation', distribution:'Distribution',
  leaf:'Leaf', server:'Server', firewall:'Firewall', 'load-balancer':'Load Balancer',
  hypervisor:'Hypervisor', management:'Mgmt', border:'Border',
}

const SITE_GAP = 260

/** サイト内の role 集合から判別名を付ける */
function deriveSiteLabel(roles: Set<string>, idx: number): string {
  if (roles.has('spine') || roles.has('leaf')) return 'DC Fabric'
  if (roles.has('core') && roles.has('distribution')) return 'Campus'
  if (roles.has('core')) return 'Core Site'
  return `Site ${idx + 1}`
}

/** (node, IF) が VLAN のポートか。ポートが LAG なら、リンクの lag_id で照合する（ADR-0013）*/
function onPort(ports: Map<string, Set<string>> | undefined, node: string,
  ifName: string | undefined, lagId: string | undefined): boolean {
  const set = ports?.get(node)
  if (!set) return false
  return (!!ifName && set.has(ifName)) || (!!lagId && set.has(lagId))
}

export function buildFlow(data: TopologyData): FlowGraphData {
  const l1Nodes = data.nodes
    .map(n => n.data as CyNodeData)
    .filter(nd => nd.type === 'node')
  const allEdges = data.edges.map(e => e.data as CyEdgeData)
  const idSet = new Set(l1Nodes.map(n => n.id))

  // ── サイト検出: WAN リンクを除いた L1 物理リンクの連結成分 ──
  const intraLinks = allEdges.filter(d =>
    d.type === 'link' && d.link_role !== 'wan' && idSet.has(d.source) && idSet.has(d.target))
  // 段の決め方はリンクの書き順（source / target）を見ない（ADR-0006: 物理リンクは無向）
  const adjL1 = new Map<string, Set<string>>()
  l1Nodes.forEach(nd => adjL1.set(nd.id, new Set()))
  intraLinks.forEach(d => {
    if (d.source === d.target) return
    adjL1.get(d.source)!.add(d.target)
    adjL1.get(d.target)!.add(d.source)
  })
  const siteOf = new Map<string, number>()
  let siteCount = 0
  for (const nd of l1Nodes) {
    if (siteOf.has(nd.id)) continue
    const si = siteCount++
    const queue = [nd.id]
    siteOf.set(nd.id, si)
    while (queue.length) {
      const cur = queue.pop()!
      for (const nb of adjL1.get(cur) ?? []) {
        if (!siteOf.has(nb)) { siteOf.set(nb, si); queue.push(nb) }
      }
    }
  }

  // ── サイトごとに段とファブリックを決めて配置 → 横並びに配置 ──
  const roleOf = new Map(l1Nodes.map(nd => [nd.id, nd.role ?? '']))
  const mlagClients = findMlagClients(allEdges)
  const pos = new Map<string, { x: number; y: number }>()   // 全体中心座標（y は段の位置が決まってから入れる）
  const tierOf = new Map<string, number>()
  const sites: SiteInfo[] = []
  let offsetX = 0

  for (let si = 0; si < siteCount; si++) {
    const siteIds = l1Nodes.filter(nd => siteOf.get(nd.id) === si).map(nd => nd.id)
    const laid = layoutSite(siteIds, roleOf, adjL1, mlagClients)
    const roleSet = new Set<string>()
    let siteW = 0
    siteIds.forEach(id => {
      const x = laid.x.get(id)!
      pos.set(id, { x: x + offsetX, y: 0 })
      tierOf.set(id, laid.tierOf.get(id)!)
      roleSet.add(roleOf.get(id) || 'unknown')
      siteW = Math.max(siteW, x + CARD_W / 2)
    })
    sites.push({
      id: si, label: deriveSiteLabel(roleSet, si),
      xLeft: offsetX, yTop: 0, xRight: offsetX + siteW, yBot: 0,
    })
    offsetX += siteW + SITE_GAP
  }
  const totalW = Math.max(offsetX - SITE_GAP, 1)

  // ── VLAN のメンバー（札の帯の大きさで段の間隔を決めるので、機器の縦の位置より先に求める）──
  const vlanMemberEdges = allEdges.filter(d => d.type === 'vlan_member')
  const vlanMembers = new Map<string, string[]>()
  // vlan id → (node id → そのノード上の trunk/access ポート名)
  const vlanPorts = new Map<string, Map<string, Set<string>>>()
  vlanMemberEdges.forEach(e => {
    if (!idSet.has(e.target)) return
    if (!vlanMembers.has(e.source)) vlanMembers.set(e.source, [])
    vlanMembers.get(e.source)!.push(e.target)
    if (!vlanPorts.has(e.source)) vlanPorts.set(e.source, new Map())
    // 新形式 tagged_on/untagged_on を優先、旧 interfaces にフォールバック
    const ifs = [...(e.tagged_on ?? []), ...(e.untagged_on ?? []),
      ...(e.tagged_on || e.untagged_on ? [] : (e.interfaces ?? []))]
    vlanPorts.get(e.source)!.set(e.target, new Set(ifs))
  })

  // ── VLAN の札の帯: ポートを持ついちばん下の段の機器の下に、近い札を縦の列にそろえて並べる ──
  const vlanNodes = data.nodes.map(n => n.data as CyNodeData).filter(nd => nd.type === 'vlan')
  const bands = new Map<string, { site: number; tier: number; pills: Pill[] }>()
  vlanNodes.forEach(vd => {
    const memberIds = vlanMembers.get(vd.id) ?? []
    if (memberIds.length === 0) return
    const want = memberIds.reduce((s, id) => s + pos.get(id)!.x, 0) / memberIds.length
    const deepest = memberIds.reduce((a, b) => tierOf.get(b)! > tierOf.get(a)! ? b : a)
    const site = siteOf.get(deepest)!, tier = tierOf.get(deepest)!
    const key = `${site}:${tier}`
    if (!bands.has(key)) bands.set(key, { site, tier, pills: [] })
    bands.get(key)!.pills.push({ vd, want, w: vlanPillWidth(vd) })
  })
  const packed = [...bands.values()].map(b => ({ ...b, ...packPills(b.pills) }))
  const bandH = (rows: number) => rows * VLAN_PILL_H + (rows - 1) * PILL_GAP_Y

  // ── 段の縦の位置: カードがいちばん高くなるときの高さと札の帯が収まるよう、段の間隔を広げる（全サイトで段をそろえる）──
  const cardH = new Map(l1Nodes.map(nd => [nd.id, cardHeight(nd)]))
  const tierCardH = new Map<string, number>()   // `${site}:${tier}` → その段のカードの高さの最大
  l1Nodes.forEach(nd => {
    const key = `${siteOf.get(nd.id)}:${tierOf.get(nd.id)}`
    tierCardH.set(key, Math.max(tierCardH.get(key) ?? 0, cardH.get(nd.id)!))
  })
  const nTier = Math.max(0, ...tierOf.values()) + 1
  const tierTop = [40]
  for (let t = 0; t < nTier - 1; t++) {
    let pitch = ROW_PITCH
    tierCardH.forEach((h, key) => { if (key.endsWith(`:${t}`)) pitch = Math.max(pitch, h + TIER_GAP) })
    packed.filter(b => b.tier === t).forEach(b => {
      pitch = Math.max(pitch, tierCardH.get(`${b.site}:${t}`)! + PILL_BAND_TOP + bandH(b.rows) + PILL_BAND_BOTTOM)
    })
    tierTop.push(tierTop[t] + pitch)
  }
  pos.forEach((c, id) => { c.y = tierTop[tierOf.get(id)!] + CARD_H / 2 })
  /** 段の札の帯の上端と下端 */
  const bandOf = new Map(packed.map(b => {
    const top = tierTop[b.tier] + tierCardH.get(`${b.site}:${b.tier}`)! + PILL_BAND_TOP
    return [`${b.site}:${b.tier}`, { top, bottom: top + bandH(b.rows) }]
  }))
  sites.forEach(s => {
    tierCardH.forEach((h, key) => {
      const [site, tier] = key.split(':').map(Number)
      if (site === s.id) s.yBot = Math.max(s.yBot, tierTop[tier] + h, bandOf.get(key)?.bottom ?? 0)
    })
  })
  const globalMaxY = Math.max(0, ...sites.map(s => s.yBot))

  // ── RF デバイスノード ──
  const nodes: Node[] = l1Nodes.map(nd => {
    const c = pos.get(nd.id) ?? { x: 0, y: 0 }
    return {
      id: nd.id, type: 'device',
      position: { x: c.x - CARD_W / 2, y: c.y - CARD_H / 2 },
      data: { ...nd },
    }
  })
  const centerOf = (id: string) => pos.get(id) ?? { x: 0, y: 0 }

  // ── Tier 帯（サイト × rank ごと。X 範囲はサイト幅）──
  const tierGroups = new Map<string, { ys: number[]; roles: string[]; site: number; rank: number }>()
  l1Nodes.forEach(nd => {
    const rank = tierOf.get(nd.id)
    const c = pos.get(nd.id)
    if (rank == null || !c) return
    const site = siteOf.get(nd.id)!
    const key = `${site}:${rank}`
    if (!tierGroups.has(key)) tierGroups.set(key, { ys: [], roles: [], site, rank })
    const grp = tierGroups.get(key)!
    grp.ys.push(c.y - CARD_H / 2, c.y - CARD_H / 2 + cardH.get(nd.id)!)
    grp.roles.push(nd.role ?? 'unknown')
  })
  const tiers: TierInfo[] = [...tierGroups.values()]
    .sort((a, b) => a.site - b.site || a.rank - b.rank)
    .map(grp => {
      const freq: Record<string, number> = {}
      grp.roles.forEach(r => { freq[r] = (freq[r] ?? 0) + 1 })
      const dom = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const site = sites[grp.site]
      const yBot = Math.max(...grp.ys)
      return {
        yTop: Math.min(...grp.ys), yBot, yEnd: bandOf.get(`${grp.site}:${grp.rank}`)?.bottom ?? yBot,
        label: TIER_LABEL[dom] ?? dom, roles: freq,
        xLeft: site.xLeft, xRight: site.xRight,
      }
    })

  // ── L1 リンク (並列オフセット割当) ──
  const pairMap = new Map<string, CyEdgeData[]>()
  allEdges.filter(d => d.type === 'link' && idSet.has(d.source) && idSet.has(d.target))
    .forEach(d => {
      const key = [d.source, d.target].sort().join('|')
      if (!pairMap.has(key)) pairMap.set(key, [])
      pairMap.get(key)!.push(d)
    })

  // 同じ段の離れた機器どうしのリンク（間に同じ段の別の機器がある）は、カードを突き抜けないよう上を回して描く
  const detour = (a: string, b: string) => {
    const t = tierOf.get(a)
    if (t == null || t !== tierOf.get(b) || siteOf.get(a) !== siteOf.get(b)) return false
    const [lo, hi] = [centerOf(a).x, centerOf(b).x].sort((p, q) => p - q)
    return l1Nodes.some(nd => nd.id !== a && nd.id !== b && tierOf.get(nd.id) === t
      && siteOf.get(nd.id) === siteOf.get(a) && centerOf(nd.id).x > lo && centerOf(nd.id).x < hi)
  }

  const adjacency = new Map<string, Set<string>>()
  const edges: Edge[] = []
  pairMap.forEach(links => {
    const around = detour(links[0].source, links[0].target)
    links.forEach((d, i) => {
      if (!adjacency.has(d.source)) adjacency.set(d.source, new Set())
      if (!adjacency.has(d.target)) adjacency.set(d.target, new Set())
      adjacency.get(d.source)!.add(d.target)
      adjacency.get(d.target)!.add(d.source)
      edges.push({
        id: d.id, source: d.source, target: d.target, type: 'link',
        data: { ...d, offsetIndex: i, offsetCount: links.length,
          showLabel: i === Math.floor((links.length - 1) / 2), detour: around },
      })
    })
  })

  // ── MLAG ドメイン ──
  const mlagBySrc = new Map<string, Set<string>>()
  allEdges.filter(d => d.lag_type === 'mlag' && d.lag_id).forEach(d => {
    if (!mlagBySrc.has(d.lag_id!)) mlagBySrc.set(d.lag_id!, new Set())
    mlagBySrc.get(d.lag_id!)!.add(d.source)
  })
  const mlagDomains = new Map<string, string[]>()
  mlagBySrc.forEach((srcs, lagId) => {
    if (srcs.size >= 2) mlagDomains.set(lagId, [...srcs])
  })

  // ── VLAN ⇔ L1 リンクのマッピング（リンク沿いレール表示用）──
  // ポート情報があれば (node, IF) の一致で判定。なければ両端がメンバーのリンク。
  const vlanHue = new Map<string, number>()
  let hueIdx = 0
  vlanMembers.forEach((_m, vlanId) => { vlanHue.set(vlanId, (40 + hueIdx++ * 47) % 360) })

  const vlanOnLink = new Map<string, VlanRail[]>()   // link edge id → rails
  const vlanIdNum = new Map<string, number>()
  vlanMemberEdges.forEach(e => { if (e.vlan_id != null) vlanIdNum.set(e.source, e.vlan_id) })

  pairMap.forEach(links => {
    links.forEach(d => {
      const rails: VlanRail[] = []
      vlanMembers.forEach((members, vlanId) => {
        const ports = vlanPorts.get(vlanId)
        const hasPorts = [...(ports?.values() ?? [])].some(s => s.size > 0)
        let carries: boolean
        if (hasPorts) {
          carries = onPort(ports, d.source, d.source_if, d.lag_id)
            || onPort(ports, d.target, d.target_if, d.lag_id)
        } else {
          carries = members.includes(d.source) && members.includes(d.target)
        }
        if (carries) {
          rails.push({ vlanId, vlanNum: vlanIdNum.get(vlanId) ?? 0, hue: vlanHue.get(vlanId)! })
        }
      })
      if (rails.length) vlanOnLink.set(d.id, rails)
    })
  })

  // ── VLAN の端点: エクスポーターが参照をたどって求めたもの（ADR-0013 D7）。ここでは導出しない ──
  const vlanEndpoints = new Map<string, Map<string, VlanEndpoint[]>>()
  vlanMemberEdges.forEach(e => {
    (e.endpoints ?? []).forEach(ep => {
      if (!idSet.has(ep.node)) return
      if (!vlanEndpoints.has(e.source)) vlanEndpoints.set(e.source, new Map())
      const byNode = vlanEndpoints.get(e.source)!
      if (!byNode.has(ep.node)) byNode.set(ep.node, [])
      byNode.get(ep.node)!.push({ ...ep, via: e.target })
    })
  })

  // ── VLAN の札（帯と列は段の位置を決めるときに求めた）──
  packed.forEach(b => {
    const top = bandOf.get(`${b.site}:${b.tier}`)!.top
    b.placed.forEach(({ pill, x, row }) => nodes.push({
      id: pill.vd.id, type: 'vlan',
      position: { x, y: top + row * (VLAN_PILL_H + PILL_GAP_Y) },
      data: { ...pill.vd, hue: vlanHue.get(pill.vd.id) ?? 40, pillW: pill.w },
    }))
  })

  // ── VLAN ↔ VNI バインディング ──
  const vniNodes = data.nodes.map(n => n.data as CyNodeData)
    .filter(nd => nd.type === 'l2vni' || nd.type === 'l3vni')
  const vniByVlan = new Map<string, CyNodeData[]>()
  vlanNodes.forEach(vd => {
    const list = vniNodes.filter(nd =>
      (nd.type === 'l2vni' && nd.vlan === vd.id) ||
      (nd.type === 'l3vni' && !!nd.vrf && nd.vrf === vd.vrf_name))
    if (list.length) vniByVlan.set(vd.id, list)
  })
  const vniById = new Map(vniNodes.map(nd => [nd.id, nd]))

  // ── VTEP: 機器ノードの vteps から vtep id → 終端ノード / アドレス（ADR-0014）──
  const vtepNodes = new Map<string, string[]>()
  const vtepAddress = new Map<string, string>()
  data.nodes.map(n => n.data as CyNodeData).filter(nd => nd.type === 'node').forEach(nd => {
    (nd.vteps as NodeVtep[] | undefined)?.forEach(v => {
      if (!vtepNodes.has(v.id)) vtepNodes.set(v.id, [])
      vtepNodes.get(v.id)!.push(nd.id)
      const addr = v.address ?? v.address_v6
      if (addr) vtepAddress.set(v.id, addr)
    })
  })

  // ── オーバーレイエッジ ──
  // 制御プレーンのセッションは 1 セッション = 1 辺 (ADR-0010 D11)。同じ機器の組に複数あるときは
  // 曲線のふくらみを変えて重ならないようにする (並びの番号を付ける)
  const nodeIds = new Set(nodes.map(n => n.id))
  const sessionsOfPair = new Map<string, number>()
  allEdges.forEach(d => {
    if (d.type === 'link') return
    if (!nodeIds.has(d.source) || !nodeIds.has(d.target)) return
    let extra = {}
    if (d.type === 'routing_neighbor') {
      const key = [d.source, d.target].sort().join('|')
      const n = sessionsOfPair.get(key) ?? 0
      sessionsOfPair.set(key, n + 1)
      extra = { offsetIndex: n }
    }
    edges.push({
      id: d.id, source: d.source, target: d.target, type: 'overlay',
      data: { ...d, ...extra },
    })
  })

  // ── IF → IP マップ（リンク端点の IP 表示用）＋ SVI 抽出 ──
  // ips は "IF名:IP" 形式。IF 名が VLAN ノード id に一致するものは SVI。
  const ifIp = new Map<string, Map<string, string>>()
  const sviByVlan = new Map<string, { node: string; label: string; ip: string }[]>()
  const labelOf = new Map(l1Nodes.map(nd => [nd.id, nd.label]))
  l1Nodes.forEach(nd => {
    // 新形式 l3_interfaces を優先。なければ旧 "ifname:ip" 文字列にフォールバック
    const entries: { ifName: string; ip: string; vlan?: string; isSvi: boolean }[] = []
    if (nd.l3_interfaces) {
      nd.l3_interfaces.forEach(e => entries.push({
        ifName: l3Name(e), ip: e.ip, vlan: e.vlan ?? e.attaches_to?.vlan, isSvi: isVlanIf(e),
      }))
    } else if (nd.ips) {
      nd.ips.forEach(s => {
        const idx = s.indexOf(':')
        if (idx < 0) return
        const ifName = s.slice(0, idx)
        entries.push({ ifName, ip: s.slice(idx + 1), isSvi: vlanMembers.has(ifName) })
      })
    }
    if (entries.length === 0) return
    const m = new Map<string, string>()
    entries.forEach(({ ifName, ip, vlan, isSvi }) => {
      m.set(ifName, ip)
      // SVI: 明示 vlan 参照 → IF 名が VLAN id → メンバー判定 の順で対応 VLAN を解決
      const vlanId = vlan ?? (vlanMembers.has(ifName) ? ifName : undefined)
      if (isSvi && vlanId) {
        if (!sviByVlan.has(vlanId)) sviByVlan.set(vlanId, [])
        sviByVlan.get(vlanId)!.push({ node: nd.id, label: labelOf.get(nd.id) ?? nd.id, ip })
        // ifIp は VLAN id でも引けるようにする（DeviceNode の SVI チップ用）
        m.set(vlanId, ip)
      }
    })
    ifIp.set(nd.id, m)
  })

  // hover で VLAN カード ⇔ メンバー・端点が互いに残るよう adjacency に追加
  vlanMembers.forEach((members, vlanId) => {
    if (!adjacency.has(vlanId)) adjacency.set(vlanId, new Set())
    ;[...members, ...(vlanEndpoints.get(vlanId)?.keys() ?? [])].forEach(m => {
      adjacency.get(vlanId)!.add(m)
      if (!adjacency.has(m)) adjacency.set(m, new Set())
      adjacency.get(m)!.add(vlanId)
    })
  })

  return {
    nodes, edges, tiers, sites, mlagDomains, vlanMembers, vniByVlan, vlanEndpoints, vniById, vtepNodes, vtepAddress,
    adjacency,
    vlanOnLink, vlanHue, ifIp, sviByVlan,
    graphW: totalW,
    graphH: globalMaxY + 80,
  }
}

/** 帯に並べる VLAN の札。want はポートを持つ機器の x の平均（札の中心をここに置きたい）*/
interface Pill { vd: CyNodeData; want: number; w: number }

/** VLAN の札の幅。VLAN 番号とサブネットの文字数から見積もる（VlanNode もこの幅で描く）*/
export function vlanPillWidth(nd: CyNodeData): number {
  const title = nd.label?.split('\n')[0] ?? nd.id
  const sub = nd.subnet ?? nd.subnet_v6
  return Math.round(26 + title.length * 7 + (sub ? 10 + sub.length * 6.3 : 0))
}

/**
 * 札を縦の列にそろえて並べる。列の先頭の札と本来の位置で重なる札（近い札）は同じ列に入れ、
 * 列の中は VLAN 番号の順に上から積んで左端をそろえる。PILL_MAX_ROWS を超える列は、同じ高さの列に分けて隣に並べる。
 * 列（分けた列の組）どうしは spreadRow で重ならないよう横に並べる。x は札の左端、row は上から何段目か。
 */
function packPills(pills: Pill[]): { placed: { pill: Pill; x: number; row: number }[]; rows: number } {
  const groups: Pill[][] = []
  ;[...pills].sort((a, b) => a.want - b.want).forEach(p => {
    const g = groups[groups.length - 1]
    if (g && p.want - g[0].want < (g[0].w + p.w) / 2 + PILL_GAP_X) g.push(p)
    else groups.push([p])
  })
  const blocks = groups.map(g => {
    const sorted = [...g].sort((a, b) => (a.vd.vlan_id ?? 0) - (b.vd.vlan_id ?? 0))
    const perCol = Math.ceil(g.length / Math.ceil(g.length / PILL_MAX_ROWS))
    const cols: Pill[][] = []
    for (let i = 0; i < sorted.length; i += perCol) cols.push(sorted.slice(i, i + perCol))
    const widths = cols.map(c => Math.max(...c.map(p => p.w)))
    const w = widths.reduce((s, x) => s + x, 0) + (cols.length - 1) * PILL_GAP_X
    return { cols, widths, w, want: g.reduce((s, p) => s + p.want, 0) / g.length }
  })
  const placed: { pill: Pill; x: number; row: number }[] = []
  spreadRow(blocks, PILL_GAP_X * 2).forEach(({ item, x }) => {
    item.cols.forEach((col, ci) => {
      col.forEach((pill, row) => placed.push({ pill, x, row }))
      x += item.widths[ci] + PILL_GAP_X
    })
  })
  return { placed, rows: Math.max(0, ...blocks.map(b => b.cols[0].length)) }
}

/**
 * 1 列に並ぶものを、順序を保ったまま重ならないよう横に並べる（VLAN の札・同じ段の機器）。
 * want は置きたい中心、w は幅、gap は隣との間隔。重なるものはまとめて 1 つの塊にし、
 * 塊の位置は各要素の本来の位置からのずれの平均が 0 になる所に置く（片側にだけずれない）。
 * 返す x は左端。row は want の順に並んでいること。
 */
function spreadRow<T extends { want: number; w: number }>(row: T[], gap: number): { item: T; x: number }[] {
  const blocks: { items: T[]; w: number; left: number }[] = []
  row.forEach(p => {
    let b = { items: [p], w: p.w, left: p.want - p.w / 2 }
    while (blocks.length) {
      const prev = blocks[blocks.length - 1]
      if (prev.left + prev.w + gap <= b.left) break
      blocks.pop()
      const items = [...prev.items, ...b.items]
      let off = 0, sum = 0
      items.forEach(q => { sum += q.want - q.w / 2 - off; off += q.w + gap })
      b = { items, w: off - gap, left: sum / items.length }
    }
    blocks.push(b)
  })
  return blocks.flatMap(b => {
    let x = b.left
    return b.items.map(item => {
      const placed = { item, x }
      x += item.w + gap
      return placed
    })
  })
}

// ── 機器の配置: 段（上から何段目か）とファブリックを決めて並べる ──

/**
 * 最上段にするロール（推奨語彙の解釈。ビューアーの判断で、MLNDL の仕様ではない）。
 * 数が大きいほど上。サイトに複数あれば、いちばん大きいものだけを最上段にする（super-spine があれば spine は 2 段目）。
 */
const TOP_ROLE_LEVEL: Record<string, number> = { 'super-spine': 2, spine: 1, core: 1 }
/** 段の間隔の最小（カードの上端から次の段のカードの上端まで）。カードが高い・VLAN の札の帯がある段は広げる */
const ROW_PITCH = CARD_H + 40 + 170
/** 同じ段の機器の中心どうしの最小間隔 */
const NODE_PITCH = CARD_W + 50 + 90
/** ファブリックどうしの間隔（カードの端から端まで） */
const FABRIC_GAP = 160

type Adj = Map<string, Set<string>>

/** MLAG のクライアント側の機器。MLAG の LAG のすべてのリンクに現れる機器（ペア側は片方のリンクにしか現れない）*/
function findMlagClients(edges: CyEdgeData[]): Set<string> {
  const byLag = new Map<string, CyEdgeData[]>()
  edges.filter(d => d.type === 'link' && d.lag_type === 'mlag' && d.lag_id).forEach(d => {
    if (!byLag.has(d.lag_id!)) byLag.set(d.lag_id!, [])
    byLag.get(d.lag_id!)!.push(d)
  })
  const clients = new Set<string>()
  byLag.forEach(links => {
    const ends = new Set(links.flatMap(d => [d.source, d.target]))
    if (ends.size < 3) return
    ends.forEach(n => { if (links.every(d => d.source === n || d.target === n)) clients.add(n) })
  })
  return clients
}

/** srcs からのリンクの段数（set の中だけをたどる）*/
function hops(srcs: string[], set: Set<string>, adj: Adj): Map<string, number> {
  const dist = new Map(srcs.map(s => [s, 0]))
  const queue = [...srcs]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    adj.get(cur)?.forEach(n => {
      if (set.has(n) && !dist.has(n)) { dist.set(n, dist.get(cur)! + 1); queue.push(n) }
    })
  }
  return dist
}

/**
 * サイトの段。最上段からのリンクの段数で決める（リンクの書き順は見ない）。最上段は次の順で決める。
 * 1. ロールが TOP_ROLE_LEVEL にある機器
 * 2. なければ、端末（つながる相手が 1 台だけの機器と MLAG のクライアント）から上へ数えて最も高い機器
 * 3. 端末がない・全部が端末（リング・メッシュ・直結だけ等）なら、全部を 1 段に並べる
 */
function siteTiers(ids: string[], roleOf: Map<string, string>, adj: Adj, mlagClients: Set<string>): Map<string, number> {
  const set = new Set(ids)
  const levelOf = (id: string) => TOP_ROLE_LEVEL[roleOf.get(id) ?? ''] ?? 0
  const top = Math.max(0, ...ids.map(levelOf))
  let roots: string[]
  if (top > 0) {
    roots = ids.filter(id => levelOf(id) === top)
  } else {
    const ends = ids.filter(id => [...adj.get(id)!].filter(n => set.has(n)).length <= 1 || mlagClients.has(id))
    if (ends.length === 0 || ends.length === ids.length) {
      roots = ids
    } else {
      const height = hops(ends, set, adj)
      const max = Math.max(...height.values())
      roots = ids.filter(id => height.get(id) === max)
    }
  }
  return hops(roots, set, adj)
}

/**
 * サイトをファブリックに分ける。最上段の機器のうち、直接つながるもの・下の段の相手の半分以上を共有するもの
 * （同じ leaf につながる spine どうし）を 1 つのファブリックにする。ほかの機器は、1 つ上の段の相手が
 * 最も多く属するファブリックに入れる（どの機器も、同じファブリックに 1 つ上の段の相手を持つ）。
 */
function siteFabrics(ids: string[], tierOf: Map<string, number>, adj: Adj): Map<string, number> {
  const roots = ids.filter(id => tierOf.get(id) === 0)
  const children = new Map(roots.map(r => [r, [...adj.get(r)!].filter(n => tierOf.get(n) === 1)]))
  const parent = new Map(roots.map(r => [r, r]))
  const find = (r: string): string => parent.get(r) === r ? r : find(parent.get(r)!)
  roots.forEach((a, i) => roots.slice(i + 1).forEach(b => {
    const ca = children.get(a)!, cb = children.get(b)!
    const shared = ca.filter(n => cb.includes(n)).length
    const small = Math.min(ca.length, cb.length)
    if (adj.get(a)!.has(b) || (small > 0 && shared * 2 >= small)) parent.set(find(b), find(a))
  }))
  const fabricOf = new Map<string, number>()
  const index = new Map<string, number>()
  roots.forEach(r => {
    const k = find(r)
    if (!index.has(k)) index.set(k, index.size)
    fabricOf.set(r, index.get(k)!)
  })
  ;[...ids].filter(id => tierOf.get(id)! > 0)
    .sort((a, b) => tierOf.get(a)! - tierOf.get(b)!)
    .forEach(id => {
      const count = new Map<number, number>()
      adj.get(id)!.forEach(n => {
        if (tierOf.get(n) !== tierOf.get(id)! - 1) return
        const f = fabricOf.get(n)!
        count.set(f, (count.get(f) ?? 0) + 1)
      })
      const best = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
      fabricOf.set(id, best?.[0] ?? 0)
    })
  return fabricOf
}

/** 段ごとに、x の小さい順に並べた機器 */
function rowsOf(ids: string[], tierOf: Map<string, number>, x: Map<string, number>): string[][] {
  const rows: string[][] = []
  ids.forEach(id => (rows[tierOf.get(id)!] ??= []).push(id))
  return rows.map(r => (r ?? []).sort((a, b) => x.get(a)! - x.get(b)!))
}

/** 段の並びを order に置き換える（位置は今の位置の組をそのまま使う）*/
function reorderRow(row: string[], order: string[], x: Map<string, number>): boolean {
  if (order.every((id, i) => id === row[i])) return false
  const slots = row.map(id => x.get(id)!)
  order.forEach((id, i) => x.set(id, slots[i]))
  return true
}

/**
 * ファブリックの中の横の位置。dagre で並び（線の交差が少ない順）を決め、左右の向きをそろえてから、
 * 上の段を下の段の幅に均等に広げる。side(id) は、その機器のファブリック間のリンクの相手がいる向き
 * （左なら負、右なら正、なければ 0）。
 */
function layoutFabric(ids: string[], tierOf: Map<string, number>, adj: Adj,
  side: (id: string) => number): Map<string, number> {
  const set = new Set(ids)
  const below = (id: string) => [...adj.get(id)!].filter(n => set.has(n) && tierOf.get(n) === tierOf.get(id)! + 1)
  const above = (id: string) => [...adj.get(id)!].filter(n => set.has(n) && tierOf.get(n) === tierOf.get(id)! - 1)

  // dagre: 1 段下の相手にだけ辺を張る（同じ段どうしのリンク・ほかのファブリックへのリンクは渡さない）
  const g = new Dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 90, ranksep: 170 })
  g.setDefaultEdgeLabel(() => ({}))
  ids.forEach(id => g.setNode(id, { width: CARD_W + 50, height: CARD_H + 40 }))
  ids.forEach(id => below(id).forEach(n => g.setEdge(id, n)))
  Dagre.layout(g)
  const x = new Map(ids.map(id => [id, (g.node(id) as { x: number }).x]))

  // 名前の順（leaf1, leaf2, …）と逆に並んだら左右を反転する。比べるのは末尾の番号だけが違う機器どうし
  const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
  const stem = (id: string) => id.replace(/\d+$/, '')
  let score = 0
  rowsOf(ids, tierOf, x).forEach(row => row.forEach((a, i) => row.slice(i + 1).forEach(b => {
    if (stem(a) === stem(b)) score += natural(a, b) < 0 ? 1 : -1
  })))
  if (score < 0) ids.forEach(id => x.set(id, -x.get(id)!))

  // ファブリック間のリンクを持つ機器を、相手のファブリックに面した端へ寄せる。
  // 並びが変わった段より下は、1 つ上の段の相手の平均の位置に置き直す（子が親についていく）
  let changed = false
  rowsOf(ids, tierOf, x).forEach(row => {
    if (changed) {
      const want = (id: string) => {
        const ps = above(id)
        return ps.length ? ps.reduce((s, p) => s + x.get(p)!, 0) / ps.length : x.get(id)!
      }
      const items = row.map(id => ({ id, want: want(id), w: NODE_PITCH }))
        .sort((a, b) => a.want - b.want || x.get(a.id)! - x.get(b.id)!)
      spreadRow(items, 0).forEach(({ item, x: left }) => x.set(item.id, left + NODE_PITCH / 2))
      row.sort((a, b) => x.get(a)! - x.get(b)!)
    }
    const order = [...row.filter(id => side(id) < 0), ...row.filter(id => side(id) === 0), ...row.filter(id => side(id) > 0)]
    if (reorderRow(row, order, x)) changed = true
  })

  // 下の段から順に、上の段を下の段の幅に広げる。下の段の相手の組が同じ機器（同じ leaf につながる spine）は
  // その相手の幅に均等に並べ、1 台なら相手の真ん中に置く。下に相手がない機器は今の位置のまま
  const rows = rowsOf(ids, tierOf, x)
  for (let t = rows.length - 2; t >= 0; t--) {
    const groups = new Map<string, string[]>()
    rows[t].forEach(id => {
      const key = below(id).sort().join('|')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(id)
    })
    const want = new Map<string, number>()
    groups.forEach((members, key) => {
      if (!key) { members.forEach(id => want.set(id, x.get(id)!)); return }
      const xs = below(members[0]).map(n => x.get(n)!)
      const lo = Math.min(...xs), hi = Math.max(...xs)
      members.forEach((id, i) => want.set(id, lo + (hi - lo) * (i + 0.5) / members.length))
    })
    const items = rows[t].map(id => ({ id, want: want.get(id)!, w: NODE_PITCH }))
      .sort((a, b) => a.want - b.want || x.get(a.id)! - x.get(b.id)!)
    spreadRow(items, 0).forEach(({ item, x: left }) => x.set(item.id, left + NODE_PITCH / 2))
    rows[t].sort((a, b) => x.get(a)! - x.get(b)!)
  }
  return x
}

/**
 * ファブリックを横に並べる順。隣り合うファブリックどうしのリンクの数が最も多くなる順を選ぶ
 * （数珠つなぎなら順に、離れたものどうしのリンクは間を回る線になる）。同じなら番号の順。
 */
function fabricOrder(n: number, weight: (a: number, b: number) => number): number[] {
  const base = [...Array(n).keys()]
  if (n <= 2) return base
  if (n > 7) return base
  let best = base, bestScore = -1
  const permute = (prefix: number[], rest: number[]) => {
    if (!rest.length) {
      const score = prefix.slice(1).reduce((s, f, i) => s + weight(prefix[i], f), 0)
      if (score > bestScore) { best = prefix; bestScore = score }
      return
    }
    rest.forEach((f, i) => permute([...prefix, f], [...rest.slice(0, i), ...rest.slice(i + 1)]))
  }
  permute([], base)
  return best
}

/**
 * サイトの機器の横の位置（中心）と段。x は左端の機器のカードの左端が 0。縦の位置は buildFlow で段ごとに決める。
 * 段はロール・端末から決め（siteTiers）、ファブリックごとに並べてから横に並べる。
 * ファブリックどうしは、つながる相手に border を向けて隣り合わせる。
 */
function layoutSite(ids: string[], roleOf: Map<string, string>, adj: Adj, mlagClients: Set<string>) {
  const tierOf = siteTiers(ids, roleOf, adj, mlagClients)
  const fabricOf = siteFabrics(ids, tierOf, adj)
  const nFabric = Math.max(...ids.map(id => fabricOf.get(id)!)) + 1
  const members = [...Array(nFabric)].map((_, f) => ids.filter(id => fabricOf.get(id) === f))
  const links = (a: number, b: number) => members[a].reduce((s, id) =>
    s + [...adj.get(id)!].filter(n => fabricOf.get(n) === b).length, 0)
  const order = fabricOrder(nFabric, links)
  const slot = new Map(order.map((f, i) => [f, i]))
  const side = (id: string) => [...adj.get(id)!].reduce((s, n) => {
    const d = slot.get(fabricOf.get(n)!)! - slot.get(fabricOf.get(id)!)!
    return s + Math.sign(d)
  }, 0)

  const pos = new Map<string, number>()
  let cursor = 0
  order.forEach(f => {
    const x = layoutFabric(members[f], tierOf, adj, side)
    const left = Math.min(...members[f].map(id => x.get(id)!)) - CARD_W / 2
    let right = cursor
    members[f].forEach(id => {
      const cx = x.get(id)! - left + cursor
      pos.set(id, cx)
      right = Math.max(right, cx + CARD_W / 2)
    })
    cursor = right + FABRIC_GAP
  })
  return { x: pos, tierOf }
}
