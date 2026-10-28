/**
 * useNodeDrag — ノード位置オーバーライド（ドラッグ用）
 */
import { useState, useRef, useMemo, useCallback } from 'react'
import type { TopologyData } from '../../../types/topology'
import type { LayoutResult, NodeLayout } from '../layout'

export function useNodeDrag(
  data: TopologyData | null,
  layout: LayoutResult | null,
  zoomK: number,
) {
  const [nodePosOverrides, setNodePosOverrides] = useState<Map<string, {x:number; y:number}>>(new Map())
  const nodeDrag = useRef<{
    id: string; ox: number; oy: number; nx: number; ny: number; k: number; moved: boolean
  } | null>(null)

  // データ変更時にオーバーライドをリセット（render 中の状態調整パターン）
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setNodePosOverrides(new Map())
  }

  // ドラッグ後の位置を反映した nodeMap
  const effectiveNodeMap = useMemo(() => {
    if (!layout) return new Map<string, NodeLayout>()
    const m = new Map(layout.nodeMap)
    nodePosOverrides.forEach((pos, id) => {
      const n = m.get(id)
      if (n) m.set(id, { ...n, ...pos })
    })
    return m
  }, [layout, nodePosOverrides])

  const effectiveNodeLayouts = useMemo(
    () => layout?.nodeLayouts.map(n => effectiveNodeMap.get(n.id) ?? n) ?? [],
    [layout, effectiveNodeMap]
  )

  const onNodeMouseMove = useCallback((e: MouseEvent) => {
    if (!nodeDrag.current) return
    const { id, ox, oy, nx, ny, k } = nodeDrag.current
    const dx = e.clientX - ox, dy = e.clientY - oy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) nodeDrag.current.moved = true
    setNodePosOverrides(prev => {
      const next = new Map(prev)
      next.set(id, { x: nx + dx / k, y: ny + dy / k })
      return next
    })
  }, [])

  const onNodeMouseUp = useCallback(() => {
    nodeDrag.current = null
    window.removeEventListener('mousemove', onNodeMouseMove)
  }, [onNodeMouseMove])

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const n = effectiveNodeMap.get(id)
    if (!n) return
    nodeDrag.current = { id, ox: e.clientX, oy: e.clientY, nx: n.x, ny: n.y, k: zoomK, moved: false }
    window.addEventListener('mousemove', onNodeMouseMove)
    window.addEventListener('mouseup', onNodeMouseUp, { once: true })
  }, [effectiveNodeMap, zoomK, onNodeMouseMove, onNodeMouseUp])

  return { effectiveNodeMap, effectiveNodeLayouts, nodeDrag, onNodeMouseDown }
}
