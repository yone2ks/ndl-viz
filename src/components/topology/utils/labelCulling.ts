/**
 * labelCulling.ts — グリッドハッシュによるラベル間引き
 *
 * 優先度の高い順に処理し、すでに占有されたグリッドセルに重なるラベルを捨てる。
 * O(ラベル数) なので tf 変化ごとの再計算でも 100 ノード規模で問題ない。
 */

export interface LabelItem {
  key: string        // 採用判定の識別子
  x: number          // グラフ座標
  y: number
  w: number          // ラベル概算幅（グラフ座標）
  h: number          // ラベル概算高さ
  priority: number   // 大きいほど優先（速度 > IF）
}

/** 採用されたラベルの key 集合を返す */
export function cullLabels(items: LabelItem[], cellSize = 30): Set<string> {
  const occupied = new Set<string>()
  const accepted = new Set<string>()
  const sorted = [...items].sort((a, b) => b.priority - a.priority)
  for (const it of sorted) {
    const c0 = Math.floor((it.x - it.w / 2) / cellSize)
    const c1 = Math.floor((it.x + it.w / 2) / cellSize)
    const r0 = Math.floor((it.y - it.h / 2) / cellSize)
    const r1 = Math.floor((it.y + it.h / 2) / cellSize)
    let free = true
    for (let c = c0; c <= c1 && free; c++)
      for (let r = r0; r <= r1 && free; r++)
        if (occupied.has(`${c},${r}`)) free = false
    if (!free) continue
    accepted.add(it.key)
    for (let c = c0; c <= c1; c++)
      for (let r = r0; r <= r1; r++)
        occupied.add(`${c},${r}`)
  }
  return accepted
}
