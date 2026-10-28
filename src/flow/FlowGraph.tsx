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
import { FlowCtx, type FlowCtxValue } from './FlowCtx'
import { roleStyle } from './palette'
import { l3Name, primaryAddress } from './l3'
import type { TopologyData, OverlayKey, CyNodeData, CyEdgeData } from '../types/topology'
import './flow.css'

const nodeTypes: NodeTypes = { device: DeviceNode, vlan: VlanNode }
const edgeTypes: EdgeTypes = { link: LinkEdge, overlay: OverlayEdge }

interface Props {
  data: TopologyData
  overlays: Set<OverlayKey>
  query: string
  onSelect: (el: { data: CyNodeData | CyEdgeData } | null) => void
}

/** ノード data から検索対象テキストを連結（小文字）*/
function nodeSearchText(d: CyNodeData): string {
  const parts: (string | number | undefined)[] = [
    d.id, d.label, d.role, primaryAddress(d), d.subnet, d.gateway, d.vrf_name, d.vlan_id, d.vni, d.local_as,
    ...(d.vrfs ?? []), ...(d.vlans ?? []), ...(d.ips ?? []),
    ...(d.l3_interfaces ?? []).flatMap(e => [l3Name(e), e.ip, e.ipv6, e.vrf, e.vlan]),
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function FlowGraphInner({ data, overlays, query, onSelect }: Props) {
  const graph = useMemo(() => buildFlow(data), [data])
  const { setCenter, getZoom, fitView } = useReactFlow()

  // graph が変わるたびにノード測定完了後に fitView を再実行
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.22, maxZoom: 1.0, duration: 0 }), 50)
    return () => clearTimeout(timer)
  }, [graph, fitView])

  // ── 検索マッチ ──
  const q = query.trim().toLowerCase()
  const matchedIds = useMemo(() => {
    const ids = new Set<string>()
    if (!q) return ids
    const matchedNodes = new Set<string>()
    graph.nodes.forEach(n => {
      if (nodeSearchText(n.data as unknown as CyNodeData).includes(q)) {
        ids.add(n.id); matchedNodes.add(n.id)
      }
    })
    graph.edges.forEach(e => {
      const ed = e.data as unknown as CyEdgeData
      const txt = [ed.source_if, ed.target_if, ed.link_speed, ed.label, ed.lag_id]
        .filter(Boolean).join(' ').toLowerCase()
      if (txt.includes(q) || matchedNodes.has(e.source) || matchedNodes.has(e.target)) {
        ids.add(e.id)
      }
    })
    return ids
  }, [q, graph])

  // クエリ変更時、最初のマッチノードへセンタリング
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) {
    setPrevQ(q)
    if (q) {
      const first = graph.nodes.find(n => matchedIds.has(n.id))
      if (first) {
        const w = first.measured?.width ?? 184, h = first.measured?.height ?? 92
        setCenter(first.position.x + w / 2, first.position.y + h / 2,
          { zoom: Math.max(getZoom(), 1.0), duration: 400 })
      }
    }
  }

  // ノード位置はドラッグ可能にするためローカル state で管理
  const [nodes, setNodes] = useState<Node[]>(graph.nodes)
  const [prevGraph, setPrevGraph] = useState(graph)
  if (graph !== prevGraph) { setPrevGraph(graph); setNodes(graph.nodes) }
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
  const vniFocusNodes = useMemo(() => {
    const vni = focusVniId ? graph.vniById.get(focusVniId) : undefined
    if (!vni) return null
    return new Set(((vni.vteps ?? []) as string[]).flatMap(v => graph.vtepNodes.get(v) ?? []))
  }, [focusVniId, graph])
  const ctx = useMemo<FlowCtxValue>(() => ({
    overlays,
    hoveredId: hoveredId ?? focusVlanId,
    setHoveredId,
    adjacency: graph.adjacency, vniByVlan: graph.vniByVlan,
    vlanEndpoints: graph.vlanEndpoints,
    vniById: graph.vniById, vtepNodes: graph.vtepNodes, vtepAddress: graph.vtepAddress,
    vlanOnLink: graph.vlanOnLink,
    ifIp: graph.ifIp, sviByVlan: graph.sviByVlan, vlanHue: graph.vlanHue,
    focusVlanId, setFocusVlanId,
    focusVniId, setFocusVniId, vniFocusNodes,
    query: q, matchedIds,
  }), [overlays, hoveredId, focusVlanId, focusVniId, vniFocusNodes, graph, q, matchedIds])

  const handleNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    onSelect({ data: node.data as unknown as CyNodeData })
    setFocusVlanId(node.type === 'vlan' ? node.id : null)
    setFocusVniId(null)
    // VLAN カード選択時はズームインせず全体俯瞰のままフォーカスを見せる
    if (node.type !== 'vlan') {
      const w = node.measured?.width ?? 184, h = node.measured?.height ?? 92
      setCenter(node.position.x + w / 2, node.position.y + h / 2,
        { zoom: Math.max(getZoom(), 1.1), duration: 450 })
    }
  }, [onSelect, setCenter, getZoom])

  const handleEdgeClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    onSelect({ data: edge.data as unknown as CyEdgeData })
    setFocusVlanId(null)
    setFocusVniId(null)
  }, [onSelect])

  return (
    <FlowCtx.Provider value={ctx}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.0 }}
        minZoom={0.12}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={() => { onSelect(null); setFocusVlanId(null); setFocusVniId(null) }}
        nodesConnectable={false}
        elementsSelectable
        defaultEdgeOptions={{ type: 'link' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2}
          color="rgba(148,163,184,0.14)" />
        <GraphOverlays tiers={graph.tiers} sites={graph.sites} mlagDomains={graph.mlagDomains}
          graphW={graphWOf(graph.graphW)} />
        <VxlanTunnels />
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
