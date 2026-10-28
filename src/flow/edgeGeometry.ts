/**
 * edgeGeometry.ts — フローティングエッジの端点計算
 *
 * ノード矩形の境界交点を計算し、並列リンク (LAG 等) には法線方向オフセットを与える。
 */
import type { InternalNode } from '@xyflow/react'

interface Rect { x: number; y: number; w: number; h: number }

function nodeRect(node: InternalNode): Rect {
  const { x, y } = node.internals.positionAbsolute
  const w = node.measured?.width ?? 180
  const h = node.measured?.height ?? 80
  return { x, y, w, h }
}

/** 矩形中心から (tx,ty) へ向かう直線と矩形境界の交点 */
function rectIntersect(r: Rect, tx: number, ty: number): { x: number; y: number } {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const dx = tx - cx, dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = Math.abs(dx) > 1e-6 ? (r.w / 2) / Math.abs(dx) : Infinity
  const sy = Math.abs(dy) > 1e-6 ? (r.h / 2) / Math.abs(dy) : Infinity
  const t = Math.min(sx, sy)
  return { x: cx + dx * t, y: cy + dy * t }
}

export interface EdgeGeom {
  sx: number; sy: number; tx: number; ty: number
  mx: number; my: number
  nx: number; ny: number   // 線方向の単位ベクトル
  px: number; py: number   // 法線方向の単位ベクトル
}

/**
 * source/target ノード境界の交点 + 並列オフセット
 * offsetIndex / offsetCount は同一ペア間の複数リンクの離隔に使う
 */
export function edgeGeometry(
  source: InternalNode, target: InternalNode,
  offsetIndex = 0, offsetCount = 1, spacing = 14,
): EdgeGeom {
  const sr = nodeRect(source), tr = nodeRect(target)
  const scx = sr.x + sr.w / 2, scy = sr.y + sr.h / 2
  const tcx = tr.x + tr.w / 2, tcy = tr.y + tr.h / 2

  const dx = tcx - scx, dy = tcy - scy
  const len = Math.hypot(dx, dy) || 1
  const nx = dx / len, ny = dy / len
  const px = -ny, py = nx
  const off = (offsetIndex - (offsetCount - 1) / 2) * spacing

  const sp = rectIntersect(sr, tcx, tcy)
  const tp = rectIntersect(tr, scx, scy)
  const sx = sp.x + px * off, sy = sp.y + py * off
  const tx = tp.x + px * off, ty = tp.y + py * off
  return {
    sx, sy, tx, ty,
    mx: (sx + tx) / 2, my: (sy + ty) / 2,
    nx, ny, px, py,
  }
}
