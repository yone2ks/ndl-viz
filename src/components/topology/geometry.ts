/**
 * geometry.ts — 境界交点・エッジ座標計算（純関数）
 */
import { rcfg } from './theme'
import type { NodeLayout } from './layout'

// ── ノード境界交点 ──────────────────────────────────────────────────────

export function boundaryPt(n: NodeLayout, toX: number, toY: number): { x: number; y: number } {
  const dx = toX - n.x, dy = toY - n.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ex = dx / len, ey = dy / len
  const { shape, w, h } = rcfg(n.data.role)
  let t: number
  if (shape === 'diamond') {
    t = 1 / (Math.abs(ex) / (w / 2) + Math.abs(ey) / (h / 2))
  } else if (shape === 'ellipse') {
    t = 1 / Math.sqrt((ex / (w / 2)) ** 2 + (ey / (h / 2)) ** 2)
  } else if (shape === 'hexagon' || shape === 'octagon') {
    t = Math.min(w, h) / 2
  } else {
    const ta = Math.abs(ex) > 1e-4 ? (w / 2) / Math.abs(ex) : 1e9
    const tb = Math.abs(ey) > 1e-4 ? (h / 2) / Math.abs(ey) : 1e9
    t = Math.min(ta, tb)
  }
  return { x: n.x + ex * (t + 5), y: n.y + ey * (t + 5) }
}

// ── エッジ座標計算（並列オフセット付き）──────────────────────────────────

export interface EP {
  x1: number; y1: number; x2: number; y2: number
  mx: number; my: number
  ifx1: number; ify1: number   // source 側 IF ラベル位置
  ifx2: number; ify2: number   // target 側 IF ラベル位置
  px: number; py: number       // 垂直方向単位ベクトル（バンド幅用）
}
export function edgePts(src: NodeLayout, tgt: NodeLayout, idx: number, total: number): EP {
  const SPACING = 8
  const off = (idx - (total - 1) / 2) * SPACING
  const dx = tgt.x - src.x, dy = tgt.y - src.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = dx / len, ny = dy / len
  const px = -ny, py = nx
  const sp = boundaryPt(src, tgt.x, tgt.y)
  const ep = boundaryPt(tgt, src.x, src.y)
  const x1 = sp.x + px * off, y1 = sp.y + py * off
  const x2 = ep.x + px * off, y2 = ep.y + py * off
  return {
    x1, y1, x2, y2,
    mx: (x1 + x2) / 2, my: (y1 + y2) / 2,
    ifx1: x1 + nx * 28, ify1: y1 + ny * 28,
    ifx2: x2 - nx * 28, ify2: y2 - ny * 28,
    px, py,
  }
}
