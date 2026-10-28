/**
 * TopologyGraphSVG — ShowNet スタイル SVG レンダラー（オーケストレータ）
 *
 * dagre レイアウト + カスタム SVG で ShowNet スタイルを実現する。
 * 描画は layers/ 配下のコンポーネントに分離。共有状態は GraphContext で配る。
 * tf (zoom/pan) は親の <g transform> だけが消費する — Context には入れない。
 */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import type { TopologyData, OverlayKey, CyNodeData, CyEdgeData } from '../../types/topology'
import { defaultIconRegistry, type IconRenderer } from '../../icons/networkIcons'
import { THEME_UI } from './theme'
import { computeLayout } from './layout'
import { GraphContext, type GraphContextValue, type Lod } from './GraphContext'
import { useViewTransform } from './hooks/useViewTransform'
import { useNodeDrag } from './hooks/useNodeDrag'
import { lodFromZoom } from './utils/lod'
import { TierBands } from './layers/TierBands'
import { AggregatedTiers } from './layers/AggregatedTiers'
import { MlagDomains } from './layers/MlagDomains'
import { LagBundles } from './layers/LagBundles'
import { PhysicalLinks } from './layers/PhysicalLinks'
import { OverlayEdges } from './layers/OverlayEdges'
import { VlanNodes } from './layers/VlanNodes'
import { VlanHulls } from './layers/VlanHulls'
import { StackView } from './layers/StackView'
import { stackExtent, SHEAR } from './utils/planeTransform'
import { Nodes } from './layers/Nodes'
import { LegendSVG } from './Legend'

interface Props {
  data: TopologyData | null
  overlays: Set<OverlayKey>
  theme: 'dark' | 'light'
  /** flat = 同一平面オーバーレイ（既定）/ stack = 2.5D レイヤースタック */
  viewMode?: 'flat' | 'stack'
  onSelect: (el: { data: CyNodeData | CyEdgeData } | null) => void
  /** role ごとのアイコン差し替え（省略時は defaultIconRegistry を使用）*/
  iconRegistry?: Record<string, IconRenderer>
}

export default function TopologyGraphSVG({ data, overlays, theme, viewMode = 'flat', onSelect, iconRegistry }: Props) {
  const ui = THEME_UI[theme]
  const icons = useMemo(
    () => ({ ...defaultIconRegistry, ...iconRegistry }),
    [iconRegistry]
  )
  const svgRef = useRef<SVGSVGElement>(null)
  const prevDataRef = useRef<TopologyData | null>(null)

  const { tf, panning, onWheel, onMouseDown, fitTo, focusOn } = useViewTransform(svgRef)

  // layout は data のみに依存（overlays/theme のトグルで dagre を再実行しない）
  const layout = useMemo(() => data ? computeLayout(data) : null, [data])

  const { effectiveNodeMap, effectiveNodeLayouts, nodeDrag, onNodeMouseDown } =
    useNodeDrag(data, layout, tf.k)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // LOD: しきい値交差時のみ変化（render 中の状態調整パターン）
  const [lod, setLod] = useState<Lod>('mid')
  const nextLod = lodFromZoom(tf.k, lod)
  if (nextLod !== lod) setLod(nextLod)

  // 選択時: ノードなら selectedId を更新してフォーカス遷移
  const handleSelect = useCallback((el: { data: CyNodeData | CyEdgeData } | null) => {
    const id = el && layout?.nodeMap.has((el.data as CyNodeData).id)
      ? (el.data as CyNodeData).id
      : null
    setSelectedId(id)
    if (id) {
      const n = effectiveNodeMap.get(id)
      if (n) focusOn(n.x, n.y)
    }
    onSelect(el)
  }, [layout, effectiveNodeMap, focusOn, onSelect])

  // データ変更時: グラフをビューポートにフィット
  useEffect(() => {
    if (!data || data === prevDataRef.current || !layout) return
    prevDataRef.current = data
    fitTo(layout.graphW, layout.graphH)
  }, [layout, data, fitTo])

  // viewMode 切替時: スタック全体 / 通常グラフへ再フィット
  const prevViewModeRef = useRef(viewMode)
  useEffect(() => {
    if (!layout || viewMode === prevViewModeRef.current) return
    prevViewModeRef.current = viewMode
    if (viewMode === 'stack') {
      const ext = stackExtent(layout.graphW, layout.graphH)
      fitTo(ext.w, ext.h)
    } else {
      fitTo(layout.graphW, layout.graphH)
    }
  }, [viewMode, layout, fitTo])

  const ctxValue = useMemo<GraphContextValue>(() => ({
    theme, ui,
    lod,
    overlays,
    hoveredId, setHoveredId,
    selectedId,
    adjacency: layout?.adjacency ?? new Map(),
    onSelect: handleSelect,
  }), [theme, ui, lod, overlays, hoveredId, selectedId, layout, handleSelect])

  // ── 空状態 ──
  if (!data || !layout) {
    return (
      <div className="graph-container">
        <div className="drop-overlay">
          <span className="icon">🌐</span>
          <span className="title">ndl-viz</span>
          <span className="sub">Cytoscape JSON をドロップ、または右上から読み込み</span>
          <code className="sub" style={{ marginTop:12, fontSize:11, color:'#374151',
            background:'#1a1d27', padding:'6px 12px', borderRadius:4 }}>
            python -m mlndl export topology.yaml &gt; topology.json
          </code>
        </div>
      </div>
    )
  }

  const { pairMap, overlayEdges, vlanLayouts, vlanMap, mlagGroups, mlagDomains,
    tierBands, nodeTier, vlanMembers, vniByVlan, graphW } = layout
  const isFar = lod === 'far'

  return (
    <GraphContext.Provider value={ctxValue}>
      <div className="graph-container" style={{ position:'relative' }}>
        <svg
          ref={svgRef}
          width="100%" height="100%"
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          style={{ background: ui.canvasBg, cursor: panning ? 'grabbing' : 'grab', display:'block', userSelect:'none' }}
          onClick={e => { if (e.target === svgRef.current) handleSelect(null) }}
        >
          <defs>
            {/* 矢印マーカー（attaches_to / vlan_member 用）*/}
            {(['arr-gray', 'arr-amber', 'arr-green', 'arr-orange', 'arr-purple'] as const).map((id, i) => {
              const colors = ['#374151', '#F59E0B', '#059669', '#EA580C', '#7C3AED']
              return (
                <marker key={id} id={id} viewBox="0 0 10 10" refX={9} refY={5}
                  markerWidth={5} markerHeight={5} orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill={colors[i]} />
                </marker>
              )
            })}
            {/* フィルター: 選択ハイライト */}
            <filter id="sel-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* フィルター: Dark テーマのノードネオングロー（多段ブラー + screen 合成）*/}
            <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b2" />
              <feBlend in="b1" in2="b2" mode="screen" result="glow" />
              <feComposite in="SourceGraphic" in2="glow" operator="over" />
            </filter>
          </defs>

          <g transform={`translate(${tf.x.toFixed(1)},${tf.y.toFixed(1)}) scale(${tf.k.toFixed(4)})`}>
            {viewMode === 'stack' ? (
              /* 2.5D スタック: 原点を正規化（shear で x が負になる分をシフト） */
              <g transform={`translate(${(Math.abs(SHEAR) * layout.graphH).toFixed(1)}, 40)`}>
                <StackView layout={layout} effectiveNodeMap={effectiveNodeMap} />
              </g>
            ) : isFar ? (
              /* far LOD: tier 集約ビュー */
              <>
                <TierBands tierBands={tierBands} graphW={graphW} />
                <AggregatedTiers tierBands={tierBands} nodeTier={nodeTier}
                  pairMap={pairMap} graphW={graphW} />
              </>
            ) : (
              <g className="lod-enter">
                <TierBands tierBands={tierBands} graphW={graphW} />
                <VlanHulls vlanMembers={vlanMembers} vlanMap={vlanMap} effectiveNodeMap={effectiveNodeMap} />
                <MlagDomains mlagDomains={mlagDomains} effectiveNodeMap={effectiveNodeMap} />
                <LagBundles pairMap={pairMap} mlagGroups={mlagGroups} effectiveNodeMap={effectiveNodeMap} />
                <PhysicalLinks pairMap={pairMap} effectiveNodeMap={effectiveNodeMap} />
                <OverlayEdges overlayEdges={overlayEdges} effectiveNodeMap={effectiveNodeMap} vlanMap={vlanMap} />
                <VlanNodes vlanLayouts={vlanLayouts} vniByVlan={vniByVlan} />
                <Nodes effectiveNodeLayouts={effectiveNodeLayouts} icons={icons}
                  nodeDrag={nodeDrag} onNodeMouseDown={onNodeMouseDown} nodeTier={nodeTier} />
              </g>
            )}
          </g>
        </svg>

        <LegendSVG overlays={overlays} theme={theme} />

        <div className="stats-bar">
          <span className="stat-chip">nodes {effectiveNodeLayouts.length}</span>
          <span className="stat-chip">edges {pairMap.size}</span>
          <span className="stat-chip">{Math.round(tf.k * 100)}% · {lod}</span>
          {overlays.size > 0 && (
            <span className="stat-chip" style={{ color:'#60a5fa' }}>
              overlay: {[...overlays].join(' + ')}
            </span>
          )}
        </div>
      </div>
    </GraphContext.Provider>
  )
}
