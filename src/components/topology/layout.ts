/**
 * layout.ts — dagre レイアウト計算
 *
 * computeLayout は data のみに依存する（overlays / theme には依存しない）。
 * オーバーレイの表示判定は描画側 (layers/OverlayEdges.tsx 等) で行う。
 */
import * as Dagre from '@dagrejs/dagre'
import type { TopologyData, OverlayKey, CyNodeData, CyEdgeData } from '../../types/topology'
import { rcfg } from './theme'

export interface NodeLayout {
  id: string; x: number; y: number; w: number; h: number; data: CyNodeData
}

// MLAG グループ: ノード ID のみ保持（ドラッグ後の位置を effectiveNodeMap で解決）
export interface MlagPair { srcId: string; tgtId: string }

export interface TierBand {
  yTop: number; yBot: number; label: string
  roleCounts: Record<string, number>   // far LOD の集約ピル用
}

export interface LayoutResult {
  nodeLayouts: NodeLayout[]
  nodeMap: Map<string, NodeLayout>
  vlanLayouts: NodeLayout[]            // L2 VLAN ノード（ポジション計算済み）
  vlanMap: Map<string, NodeLayout>     // vlan.id → layout
  pairMap: Map<string, CyEdgeData[]>   // sort(src,tgt) → links
  overlayEdges: CyEdgeData[]           // attaches_to / L3 / BGP / L2（表示判定は描画側）
  adjacency: Map<string, Set<string>>  // L1 リンク隣接（hover ハイライト用）
  mlagGroups: Map<string, MlagPair[]>  // lag_id → unique (srcId,tgtId) pairs
  mlagDomains: Map<string, string[]>   // lag_id → switch node IDs（ドメインボックス用）
  tierBands: TierBand[]                // dagre rank ごとの Y 帯（tier 区切り線用）
  nodeTier: Map<string, number>        // node id → tierBands index（far LOD の集約リンク用）
  vlanMembers: Map<string, string[]>   // vlan id → member L1 node ids（ハル表示用）
  vniByVlan: Map<string, CyNodeData[]> // vlan id → 紐づく VNI ノード（バッジ表示用）
  graphW: number
  graphH: number
}

/** オーバーレイエッジの表示判定（描画側で使用） */
export function isOverlayEdgeVisible(d: CyEdgeData, overlays: Set<OverlayKey>): boolean {
  if (d.type === 'attaches_to') return true
  if (d.type === 'routing_adjacency') return overlays.has('l3')
  if (d.type === 'bgp_session') return overlays.has('bgp')
  if (d.type === 'vlan_member') return overlays.has('l2')
  return false
}

export function computeLayout(data: TopologyData): LayoutResult {
  const l1Nodes = data.nodes.filter(n => (n.data as CyNodeData).type === 'node')
  const allEdges = data.edges.map(e => e.data as CyEdgeData)

  const g = new Dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 140, ranksep: 180, marginx: 70, marginy: 70 })
  g.setDefaultEdgeLabel(() => ({}))

  const nodeIdSet = new Set(l1Nodes.map(n => n.data.id))

  l1Nodes.forEach(n => {
    const cfg = rcfg((n.data as CyNodeData).role)
    g.setNode(n.data.id, { width: cfg.w + 40, height: cfg.h + 40 })
  })

  // L1 links のみレイアウト用に追加（重複ペアは1本だけ）
  const addedPairs = new Set<string>()
  allEdges.filter(d => d.type === 'link').forEach(d => {
    if (!nodeIdSet.has(d.source) || !nodeIdSet.has(d.target)) return
    const key = [d.source, d.target].sort().join('|')
    if (!addedPairs.has(key)) { addedPairs.add(key); g.setEdge(d.source, d.target) }
  })

  Dagre.layout(g)

  const nodeLayouts: NodeLayout[] = l1Nodes.map(n => {
    const nd = n.data as CyNodeData
    const cfg = rcfg(nd.role)
    const pos = g.node(nd.id) ?? { x: 0, y: 0 }
    return { id: nd.id, x: pos.x, y: pos.y, w: cfg.w, h: cfg.h, data: nd }
  })
  const nodeMap = new Map(nodeLayouts.map(n => [n.id, n]))

  // L1 リンクをペアでグループ化（並列線用）
  const pairMap = new Map<string, CyEdgeData[]>()
  allEdges.filter(d => d.type === 'link' && nodeMap.has(d.source) && nodeMap.has(d.target))
    .forEach(d => {
      const key = [d.source, d.target].sort().join('|')
      if (!pairMap.has(key)) pairMap.set(key, [])
      pairMap.get(key)!.push(d)
    })

  // 隣接マップ（hover ハイライト用 — L1 リンクのみ）
  const adjacency = new Map<string, Set<string>>()
  pairMap.forEach(links => {
    links.forEach(d => {
      if (!adjacency.has(d.source)) adjacency.set(d.source, new Set())
      if (!adjacency.has(d.target)) adjacency.set(d.target, new Set())
      adjacency.get(d.source)!.add(d.target)
      adjacency.get(d.target)!.add(d.source)
    })
  })

  // オーバーレイエッジ（参照整合のみ検証。表示判定は描画側）
  const overlayEdges = allEdges.filter(d => {
    if (d.type === 'link') return false
    if (d.type === 'attaches_to' || d.type === 'routing_adjacency' || d.type === 'bgp_session') {
      return nodeMap.has(d.source) && nodeMap.has(d.target)
    }
    if (d.type === 'vlan_member') return nodeMap.has(d.target)
    return false
  })

  // ── MLAG グループ計算（ID のみ保持）────────────────────────────────
  // 複数の機器の脚を束ねる Ethernet Segment ごと (mlndl ADR-0023。旧 lag_type: mlag の lag_id ごと)
  const mlagGroups = new Map<string, MlagPair[]>()
  Array.from(pairMap.values()).flat()
    .filter(d => d.ethernet_segment)
    .forEach(d => {
      if (!nodeMap.has(d.source) || !nodeMap.has(d.target)) return
      const gid = d.ethernet_segment!
      if (!mlagGroups.has(gid)) mlagGroups.set(gid, [])
      const group = mlagGroups.get(gid)!
      if (!group.some(p => p.srcId === d.source && p.tgtId === d.target)) {
        group.push({ srcId: d.source, tgtId: d.target })
      }
    })

  // ── MLAG ドメイン計算（ドメインボックス用）──────────────────────────
  // mlagGroups の srcId 集合をドメインノードとして扱う
  const mlagDomains = new Map<string, string[]>()
  mlagGroups.forEach((pairs, lagId) => {
    const switchIds = Array.from(new Set(pairs.map(p => p.srcId)))
    if (switchIds.length >= 2) mlagDomains.set(lagId, switchIds)
  })

  // ── Tier 帯計算（dagre rank → Y 範囲 → tier ラベル）──────────────
  const TIER_LABEL: Record<string, string> = {
    spine:'Spine', core:'Core', aggregation:'Aggregation',
    leaf:'Leaf', distribution:'Distribution', server:'Server',
    firewall:'Firewall', 'load-balancer':'Load Balancer', hypervisor:'Hypervisor',
    management:'Mgmt', border:'Border',
  }
  const rankGroups = new Map<number, { ys: number[]; roles: string[]; ids: string[] }>()
  l1Nodes.forEach(n => {
    const nd = n.data as CyNodeData
    const dNode = g.node(nd.id) as { y: number; rank?: number; height: number } | undefined
    if (!dNode || dNode.rank == null) return
    if (!rankGroups.has(dNode.rank)) rankGroups.set(dNode.rank, { ys: [], roles: [], ids: [] })
    const grp = rankGroups.get(dNode.rank)!
    grp.ys.push(dNode.y - dNode.height / 2, dNode.y + dNode.height / 2)
    grp.roles.push(nd.role ?? 'unknown')
    grp.ids.push(nd.id)
  })
  const nodeTier = new Map<string, number>()
  const tierBands: TierBand[] = Array.from(rankGroups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, grp], tierIdx) => {
      const freq: Record<string, number> = {}
      grp.roles.forEach(r => { freq[r] = (freq[r] ?? 0) + 1 })
      grp.ids.forEach(id => nodeTier.set(id, tierIdx))
      const domRole = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'
      return {
        yTop: Math.min(...grp.ys),
        yBot: Math.max(...grp.ys),
        label: TIER_LABEL[domRole] ?? domRole,
        roleCounts: freq,
      }
    })

  // ── VLAN ノードのレイアウト計算（L2 overlay 用）──────────────────────
  // vlan_member エッジの target (L1 ノード) 位置の重心から Y 方向に配置
  const vlanNodeElements = data.nodes.filter(n => (n.data as CyNodeData).type === 'vlan')
  const vlanMemberEdgeList = allEdges.filter(d => d.type === 'vlan_member')

  const vlanLayouts: NodeLayout[] = []
  vlanNodeElements.forEach(vn => {
    const vd = vn.data as CyNodeData
    const memberL1 = vlanMemberEdgeList
      .filter(e => e.source === vd.id)
      .map(e => nodeMap.get(e.target))
      .filter((n): n is NodeLayout => !!n)
    if (memberL1.length === 0) return
    const cx = memberL1.reduce((s, n) => s + n.x, 0) / memberL1.length
    const maxY = Math.max(...memberL1.map(n => n.y + n.h / 2))
    vlanLayouts.push({ id: vd.id, x: cx, y: maxY + 90, w: 128, h: 56, data: vd })
  })
  const vlanMap = new Map(vlanLayouts.map(v => [v.id, v]))

  // VLAN メンバーシップ（ハル表示用）
  const vlanMembers = new Map<string, string[]>()
  vlanMemberEdgeList.forEach(e => {
    if (!nodeMap.has(e.target)) return
    if (!vlanMembers.has(e.source)) vlanMembers.set(e.source, [])
    vlanMembers.get(e.source)!.push(e.target)
  })

  // VLAN ↔ VNI バインディング（バッジ表示用）
  const vniNodes = data.nodes.map(n => n.data as CyNodeData)
    .filter(nd => nd.type === 'l2vni' || nd.type === 'l3vni')
  const vniByVlan = new Map<string, CyNodeData[]>()
  vlanLayouts.forEach(v => {
    const vd = v.data
    const list = vniNodes.filter(nd =>
      (nd.type === 'l2vni' && nd.vlan === vd.id) ||
      (nd.type === 'l3vni' && !!nd.vrf && nd.vrf === vd.vrf_name))
    if (list.length) vniByVlan.set(vd.id, list)
  })

  const gi = g.graph() as { width?: number; height?: number }
  const baseH = gi.height ?? 600
  const extH = vlanLayouts.length
    ? Math.max(baseH, ...vlanLayouts.map(v => v.y + v.h / 2 + 60))
    : baseH

  return {
    nodeLayouts, nodeMap, vlanLayouts, vlanMap, pairMap, overlayEdges, adjacency,
    mlagGroups, mlagDomains, tierBands, nodeTier, vlanMembers, vniByVlan,
    graphW: gi.width ?? 800, graphH: extH,
  }
}
