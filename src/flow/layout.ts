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

export const CARD_W = 184
export const CARD_H = 92
export const VLAN_W = 200
export const VLAN_H = 96

export interface TierInfo {
  yTop: number; yBot: number; label: string; roles: Record<string, number>
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
  // dagre レイアウト用: peer-link（横断リンク）は除外。同一ティアノード間の辺が
  // dagre に渡ると一方が1ランク下に落ちるため。
  const layoutLinks = intraLinks.filter(d => d.link_role !== 'peer-link')
  const adjL1 = new Map<string, string[]>()
  l1Nodes.forEach(nd => adjL1.set(nd.id, []))
  intraLinks.forEach(d => {
    adjL1.get(d.source)!.push(d.target)
    adjL1.get(d.target)!.push(d.source)
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

  // ── サイトごとに独立 dagre レイアウト → 横並びに配置 ──
  const pos = new Map<string, { x: number; y: number }>()   // 全体中心座標
  const rankOf = new Map<string, number>()
  const sites: SiteInfo[] = []
  let offsetX = 0
  let globalMaxY = 0

  for (let si = 0; si < siteCount; si++) {
    const g = new Dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 90, ranksep: 170, marginx: 40, marginy: 40 })
    g.setDefaultEdgeLabel(() => ({}))
    const siteNodes = l1Nodes.filter(nd => siteOf.get(nd.id) === si)
    siteNodes.forEach(nd => g.setNode(nd.id, { width: CARD_W + 50, height: CARD_H + 40 }))
    const seen = new Set<string>()
    layoutLinks.forEach(d => {
      if (siteOf.get(d.source) !== si) return
      const key = [d.source, d.target].sort().join('|')
      if (!seen.has(key)) { seen.add(key); g.setEdge(d.source, d.target) }
    })
    Dagre.layout(g)

    let minX = Infinity, maxX = -Infinity, minY = Infinity
    siteNodes.forEach(nd => {
      const dn = g.node(nd.id) as { x: number; y: number } | undefined
      if (!dn) return
      minX = Math.min(minX, dn.x); maxX = Math.max(maxX, dn.x); minY = Math.min(minY, dn.y)
    })
    if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minY = 0 }

    const roleSet = new Set<string>()
    let siteMaxY = 0
    siteNodes.forEach(nd => {
      const dn = g.node(nd.id) as { x: number; y: number; rank?: number } | undefined
      if (!dn) return
      const x = dn.x - minX + offsetX + CARD_W / 2  // 左端を offsetX へ
      const y = dn.y - minY + CARD_H / 2 + 40        // 上端を 40 へ
      pos.set(nd.id, { x, y })
      if (dn.rank != null) rankOf.set(nd.id, dn.rank)
      roleSet.add(nd.role ?? 'unknown')
      siteMaxY = Math.max(siteMaxY, y + CARD_H / 2)
    })
    const siteW = (maxX - minX) + CARD_W
    sites.push({
      id: si, label: deriveSiteLabel(roleSet, si),
      xLeft: offsetX, yTop: 0, xRight: offsetX + siteW, yBot: siteMaxY,
    })
    globalMaxY = Math.max(globalMaxY, siteMaxY)
    offsetX += siteW + SITE_GAP
  }
  const totalW = Math.max(offsetX - SITE_GAP, 1)

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
    const rank = rankOf.get(nd.id)
    const c = pos.get(nd.id)
    if (rank == null || !c) return
    const site = siteOf.get(nd.id)!
    const key = `${site}:${rank}`
    if (!tierGroups.has(key)) tierGroups.set(key, { ys: [], roles: [], site, rank })
    const grp = tierGroups.get(key)!
    grp.ys.push(c.y - CARD_H / 2, c.y + CARD_H / 2)
    grp.roles.push(nd.role ?? 'unknown')
  })
  const tiers: TierInfo[] = [...tierGroups.values()]
    .sort((a, b) => a.site - b.site || a.rank - b.rank)
    .map(grp => {
      const freq: Record<string, number> = {}
      grp.roles.forEach(r => { freq[r] = (freq[r] ?? 0) + 1 })
      const dom = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const site = sites[grp.site]
      return {
        yTop: Math.min(...grp.ys), yBot: Math.max(...grp.ys),
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

  const adjacency = new Map<string, Set<string>>()
  const edges: Edge[] = []
  pairMap.forEach(links => {
    links.forEach((d, i) => {
      if (!adjacency.has(d.source)) adjacency.set(d.source, new Set())
      if (!adjacency.has(d.target)) adjacency.set(d.target, new Set())
      adjacency.get(d.source)!.add(d.target)
      adjacency.get(d.target)!.add(d.source)
      edges.push({
        id: d.id, source: d.source, target: d.target, type: 'link',
        data: { ...d, offsetIndex: i, offsetCount: links.length,
          showLabel: i === Math.floor((links.length - 1) / 2) },
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

  // ── VLAN ノード + メンバーシップ ──
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

  const vlanNodes = data.nodes.map(n => n.data as CyNodeData).filter(nd => nd.type === 'vlan')
  let maxY = Math.max(...nodes.map(n => n.position.y + CARD_H), 0)
  vlanNodes.forEach(vd => {
    const members = (vlanMembers.get(vd.id) ?? []).map(centerOf)
    if (members.length === 0) return
    const cx = members.reduce((s, p) => s + p.x, 0) / members.length
    const my = Math.max(...members.map(p => p.y)) + 190
    maxY = Math.max(maxY, my + VLAN_H)
    nodes.push({
      id: vd.id, type: 'vlan',
      position: { x: cx - VLAN_W / 2, y: my - VLAN_H / 2 },
      data: { ...vd, hue: vlanHue.get(vd.id) ?? 40 },
    })
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
  const nodeIds = new Set(nodes.map(n => n.id))
  allEdges.forEach(d => {
    if (d.type === 'link') return
    if (!nodeIds.has(d.source) || !nodeIds.has(d.target)) return
    edges.push({
      id: d.id, source: d.source, target: d.target, type: 'overlay',
      data: { ...d },
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
    graphH: Math.max(globalMaxY, maxY) + 80,
  }
}
