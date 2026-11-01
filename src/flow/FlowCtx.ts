/**
 * FlowCtx — ノード/エッジコンポーネントが共有する表示状態
 */
import { createContext, useContext } from 'react'
import type { OverlayKey, CyNodeData } from '../types/topology'
import type { VlanRail, VlanEndpoint } from './layout'

export type Lod = 'far' | 'mid' | 'near' | 'detail'

export const lodOf = (zoom: number): Lod =>
  zoom < 0.4 ? 'far' : zoom < 0.85 ? 'mid' : zoom < 1.8 ? 'near' : 'detail'

export interface FlowCtxValue {
  overlays: Set<OverlayKey>
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
  adjacency: Map<string, Set<string>>
  vniByVlan: Map<string, CyNodeData[]>
  vniById: Map<string, CyNodeData>
  /** vlan id → (端点のノード id → VLAN の端点。ADR-0013 D7) */
  vlanEndpoints: Map<string, Map<string, VlanEndpoint[]>>
  vtepNodes: Map<string, string[]>
  vtepAddress: Map<string, string>
  vlanOnLink: Map<string, VlanRail[]>
  /** node id → (IF 名 → IP)。リンク端点の IP 表示用 */
  ifIp: Map<string, Map<string, string>>
  /** vlan id → メンバー機器の SVI 一覧 */
  sviByVlan: Map<string, { node: string; label: string; ip: string }[]>
  /** vlan id → 色相（SVI チップ・レールの色対応） */
  vlanHue: Map<string, number>
  /** VLAN カード/チップのクリックによる永続フォーカス */
  focusVlanId: string | null
  setFocusVlanId: (id: string | null) => void
  /** VNI タブのクリックによるフォーカス。その VNI が載る VTEP 間にトンネルを描く */
  focusVniId: string | null
  setFocusVniId: (id: string | null) => void
  /** VNI のフォーカスで残すノード（VTEP を終端する機器、VLAN とそのポートを持つ機器・端点）。フォーカスなしなら null */
  vniFocusNodes: Set<string> | null
  /** 検索クエリ（IP/ホスト名/VLAN/VRF）。空なら検索なし */
  query: string
  /** クエリにマッチしたノード/VLAN/エッジの id 集合 */
  matchedIds: Set<string>
  /** 凡例で外した BGP の AF (address_families の値)。外した AF だけを運ぶセッションの線は出さない */
  hiddenAfs: Set<string>
}

export const FlowCtx = createContext<FlowCtxValue | null>(null)

export function useFlowCtx(): FlowCtxValue {
  const ctx = useContext(FlowCtx)
  if (!ctx) throw new Error('useFlowCtx must be used within FlowCtx.Provider')
  return ctx
}
