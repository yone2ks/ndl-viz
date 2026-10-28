/**
 * GraphContext — 描画レイヤー間で共有する状態
 *
 * 注意: tf (zoom/pan の連続値) はここに入れない。
 * tf は親の <g transform> のみが消費する（全レイヤー再レンダーを防ぐ）。
 * lod はしきい値交差時のみ変化する離散値なので Context に置ける。
 */
import { createContext, useContext } from 'react'
import type { OverlayKey, CyNodeData, CyEdgeData } from '../../types/topology'
import type { ThemeUi } from './theme'

export type Lod = 'far' | 'mid' | 'near' | 'detail'

export interface GraphContextValue {
  theme: 'dark' | 'light'
  ui: ThemeUi
  lod: Lod
  overlays: Set<OverlayKey>
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
  selectedId: string | null
  adjacency: Map<string, Set<string>>
  onSelect: (el: { data: CyNodeData | CyEdgeData } | null) => void
}

export const GraphContext = createContext<GraphContextValue | null>(null)

export function useGraphCtx(): GraphContextValue {
  const ctx = useContext(GraphContext)
  if (!ctx) throw new Error('useGraphCtx must be used within GraphContext.Provider')
  return ctx
}
