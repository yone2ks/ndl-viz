/**
 * FlowGraph — React Flow ベースのトポロジービューワ本体
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  MiniMap, Controls, useReactFlow,
  applyNodeChanges,
  type Node, type Edge, type NodeChange, type NodeTypes, type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildFlow } from './layout'
import { DeviceNode } from './DeviceNode'
import { VlanNode } from './VlanNode'
import { LinkEdge } from './LinkEdge'
import { OverlayEdge } from './OverlayEdge'
import { GraphOverlays } from './GraphOverlays'
import { VxlanTunnels } from './VxlanTunnels'
import { FlowLegend } from './FlowLegend'
import { FlowCtx, type FlowCtxValue } from './FlowCtx'
import { roleStyle } from './palette'
import { l3Name } from './l3'
import { afsHidden, overlayOf } from './session'
import type { TopologyData, OverlayKey, CyNodeData, CyEdgeData } from '../types/topology'
import './flow.css'

const nodeTypes: NodeTypes = { device: DeviceNode, vlan: VlanNode }
const edgeTypes: EdgeTypes = { link: LinkEdge, overlay: OverlayEdge }

interface Props {
  data: TopologyData
  overlays: Set<OverlayKey>
  query: string
  onSelect: (el: { data: CyNodeData | CyEdgeData } | null) => void
  /** ノード・エッジ・空白を押したとき（検索の強調を外すのに使う）*/
  onCanvasClick?: () => void
}

/** 毎回同じオブジェクトを渡す（新しいオブジェクトを渡すと、fitView() に渡した nodes が描画のたびに上書きされる）*/
const FIT_VIEW = { padding: 0.22, maxZoom: 1.0 }
/** 機器を押して隣まで見せるときの余白。左は凡例、右はプロパティの枠の分をあける */
const FOCUS_PADDING = { top: '70px', bottom: '70px', left: '170px', right: '340px' } as const

/** ノード data から検索対象テキストを連結（小文字）*/
function nodeSearchText(d: CyNodeData): string {
  const parts: (string | number | undefined)[] = [
    d.id, d.label, d.role, d.lo_ip, d.subnet, d.gateway, d.vrf_name, d.vlan_id, d.vni, d.local_as,
    ...(d.vrfs ?? []), ...(d.vlans ?? []), ...(d.ips ?? []),
    ...(d.l3_interfaces ?? []).flatMap(e => [l3Name(e), e.ip, e.ipv6, e.vrf, e.vlan]),
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function FlowGraphInner({ data, overlays, query, onSelect, onCanvasClick }: Props) {
  const graph = useMemo(() => buildFlow(data), [data])
  const { setCenter, getZoom, fitView } = useReactFlow()

  // graph が変わるたびにノード測定完了後に fitView を再実行
  useEffect(() => {
    const timer = setTimeout(() => fitView({ ...FIT_VIEW, duration: 0 }), 50)
    return () => clearTimeout(timer)
  }, [graph, fitView])

  // ── 検索マッチ ──
  const q = query.trim().toLowerCase()
  const { matchedIds, bySite } = useMemo(() => {
    const ids = new Set<string>()
    if (!q) return { matchedIds: ids, bySite: false }
    const matchedNodes = new Set<string>()
    graph.nodes.forEach(n => {
      if (nodeSearchText(n.data as unknown as CyNodeData).includes(q)) {
        ids.add(n.id); matchedNodes.add(n.id)
      }
    })
    // サイトの名前（DC Fabric 等）は、機器や VLAN に直接当たらないときだけ見る。
    // 「core」が Core Site の全機器に当たるなど、ふだんの検索を広げないため
    const bySite = matchedNodes.size === 0
    if (bySite) {
      graph.nodes.forEach(n => {
        if (graph.sites[graph.siteIdOf.get(n.id) ?? -1]?.label.toLowerCase().includes(q)) {
          ids.add(n.id); matchedNodes.add(n.id)
        }
      })
    }
    graph.edges.forEach(e => {
      const ed = e.data as unknown as CyEdgeData
      const txt = [ed.source_if, ed.target_if, ed.link_speed, ed.label, ed.lag_id]
        .filter(Boolean).join(' ').toLowerCase()
      if (txt.includes(q) || matchedNodes.has(e.source) || matchedNodes.has(e.target)) {
        ids.add(e.id)
      }
    })
    return { matchedIds: ids, bySite: bySite && matchedNodes.size > 0 }
  }, [q, graph])

  // クエリ変更時、最初のマッチノードへセンタリング（サイトに当たったらサイト全体が入るようにする）
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) {
    setPrevQ(q)
    if (q) {
      const first = graph.nodes.find(n => matchedIds.has(n.id))
      if (bySite) {
        fitView({ ...FIT_VIEW, nodes: graph.nodes.filter(n => matchedIds.has(n.id)).map(n => ({ id: n.id })),
          duration: 400 })
      } else if (first) {
        const w = first.measured?.width ?? 184, h = first.measured?.height ?? 92
        setCenter(first.position.x + w / 2, first.position.y + h / 2,
          { zoom: Math.max(getZoom(), 1.0), duration: 400 })
      }
    }
  }

  // ノード位置はドラッグ可能にするためローカル state で管理
  const [nodes, setNodes] = useState<Node[]>(graph.nodes)
  const [prevGraph, setPrevGraph] = useState(graph)
  // 押した機器に永続フォーカス（ホバー・VLAN のフォーカスが優先）
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  if (graph !== prevGraph) { setPrevGraph(graph); setNodes(graph.nodes); setFocusNodeId(null) }
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(ns => applyNodeChanges(changes, ns)),
    [],
  )

  const edges = useMemo<Edge[]>(() => graph.edges, [graph])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // VLAN カード選択中はその VLAN に永続フォーカス（ホバーは一時的に優先）
  const [focusVlanId, setFocusVlanId] = useState<string | null>(null)
  // VNI タブ選択中は、その VNI が載る VTEP 間のトンネルを描く
  const [focusVniId, setFocusVniId] = useState<string | null>(null)
  // 凡例で外した BGP の AF
  const [hiddenAfs, setHiddenAfs] = useState<Set<string>>(() => new Set())
  const toggleAf = useCallback((af: string) => setHiddenAfs(prev => {
    const next = new Set(prev)
    if (!next.delete(af)) next.add(af)
    return next
  }), [])
  const vniFocusNodes = useMemo(() => {
    const vni = focusVniId ? graph.vniById.get(focusVniId) : undefined
    if (!vni) return null
    // VNI は VLAN カードから選ぶので、VLAN とそのポートを持つ機器・端点（ホスト）も残す。
    // L3VNI は VRF に紐づくので、選んだ VLAN だけでなくその VRF の VLAN をすべて残す
    const vlans = vni.type === 'l3vni'
      ? graph.nodes.filter(n => n.type === 'vlan' && (n.data as unknown as CyNodeData).vrf_name === vni.vrf).map(n => n.id)
      : focusVlanId ? [focusVlanId] : []
    return new Set([
      ...((vni.vteps ?? []) as string[]).flatMap(v => graph.vtepNodes.get(v) ?? []),
      ...vlans,
      ...vlans.flatMap(v => [...(graph.adjacency.get(v) ?? [])]),
    ])
  }, [focusVniId, focusVlanId, graph])
  // フォーカスで残す隣: L1 の隣と VLAN に、表示中のオーバーレイの線の相手を足す（線だけ残って相手が薄くならないように）
  const adjacency = useMemo(() => {
    const adj = new Map([...graph.adjacency].map(([id, set]) => [id, new Set(set)]))
    const add = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set())
      adj.get(a)!.add(b)
    }
    graph.edges.forEach(e => {
      const d = e.data as unknown as CyEdgeData
      const kind = overlayOf(d)
      if (kind === 'always' || (kind && overlays.has(kind) && !afsHidden(d, hiddenAfs))) {
        add(e.source, e.target); add(e.target, e.source)
      }
    })
    return adj
  }, [graph, overlays, hiddenAfs])
  const ctx = useMemo<FlowCtxValue>(() => ({
    overlays,
    hoveredId: hoveredId ?? focusVlanId ?? focusNodeId,
    setHoveredId,
    adjacency, vniByVlan: graph.vniByVlan,
    vlanEndpoints: graph.vlanEndpoints,
    vniById: graph.vniById, vtepNodes: graph.vtepNodes, vtepAddress: graph.vtepAddress,
    vlanOnLink: graph.vlanOnLink,
    ifIp: graph.ifIp, sviByVlan: graph.sviByVlan, vlanHue: graph.vlanHue,
    focusVlanId, setFocusVlanId,
    focusVniId, setFocusVniId, vniFocusNodes,
    query: q, matchedIds, hiddenAfs,
  }), [overlays, hoveredId, focusVlanId, focusNodeId, focusVniId, vniFocusNodes, graph, adjacency, q, matchedIds, hiddenAfs])

  const handleNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    onSelect({ data: node.data as unknown as CyNodeData })
    onCanvasClick?.()
    setFocusVlanId(node.type === 'vlan' ? node.id : null)
    setFocusVniId(null)
    setFocusNodeId(node.type === 'vlan' ? null : node.id)
    // VLAN カード選択時はズームインせず全体俯瞰のままフォーカスを見せる。機器は隣の機器まで画面に入れる
    if (node.type !== 'vlan') {
      // VM が載るホストは入れない（遠くにあることが多く、全 VM に共通で、入れると引きすぎる）
      const hosts = new Set(graph.edges
        .filter(e => (e.data as unknown as CyEdgeData).type === 'attaches_to' && e.source === node.id)
        .map(e => e.target))
      const around = graph.nodes.filter(n => n.type === 'device'
        && (n.id === node.id || (adjacency.get(node.id)?.has(n.id) && !hosts.has(n.id))))
      fitView({ nodes: around.map(n => ({ id: n.id })), padding: FOCUS_PADDING,
        maxZoom: Math.max(getZoom(), 1.1), duration: 450 })
    }
  }, [onSelect, onCanvasClick, fitView, getZoom, graph, adjacency])

  const handleEdgeClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    onSelect({ data: edge.data as unknown as CyEdgeData })
    onCanvasClick?.()
    setFocusVlanId(null)
    setFocusVniId(null)
  }, [onSelect, onCanvasClick])

  return (
    <FlowCtx.Provider value={ctx}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.12}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={() => { onSelect(null); onCanvasClick?.(); setFocusVlanId(null); setFocusVniId(null); setFocusNodeId(null) }}
        nodesConnectable={false}
        elementsSelectable
        defaultEdgeOptions={{ type: 'link' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2}
          color="rgba(148,163,184,0.14)" />
        <GraphOverlays tiers={graph.tiers} sites={graph.sites} mlagDomains={graph.mlagDomains}
          siteIdOf={graph.siteIdOf} cardHeights={graph.cardHeights} graphW={graphWOf(graph.graphW)} />
        <VxlanTunnels />
        <FlowLegend edges={graph.edges} overlays={overlays}
          hiddenAfs={hiddenAfs} onToggleAf={toggleAf} />
        <MiniMap
          pannable zoomable
          className="flow-minimap"
          nodeColor={n => roleStyle((n.data as unknown as CyNodeData | undefined)?.role).accent}
          nodeStrokeWidth={3}
          maskColor="rgba(5,8,16,0.72)"
        />
        <Controls className="flow-controls" showInteractive={false} />
      </ReactFlow>
    </FlowCtx.Provider>
  )
}

const graphWOf = (w: number) => w

export default function FlowGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowGraphInner {...props} />
    </ReactFlowProvider>
  )
}
