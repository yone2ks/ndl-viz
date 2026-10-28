/**
 * hull.ts — 凸包計算 (Andrew's monotone chain)
 *
 * VLAN メンバーシップのハル表示に使う。点数は少ない (ノード数 × 4 角) ので
 * O(n log n) で十分。
 */

export interface Pt { x: number; y: number }

const cross = (o: Pt, a: Pt, b: Pt): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

export function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

/** ノード矩形の 4 角 (+pad) を点群に展開 */
export function rectCorners(x: number, y: number, w: number, h: number, pad: number): Pt[] {
  const hw = w / 2 + pad, hh = h / 2 + pad
  return [
    { x: x - hw, y: y - hh }, { x: x + hw, y: y - hh },
    { x: x + hw, y: y + hh }, { x: x - hw, y: y + hh },
  ]
}
