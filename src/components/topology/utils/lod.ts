/**
 * lod.ts — ズーム倍率 → LOD (Level of Detail) 変換
 *
 * | LOD    | k 範囲      | 表示内容 |
 * |--------|------------|---------|
 * | far    | k < 0.45   | tier 集約ピル + 集約リンクのみ |
 * | mid    | 0.45–1.0   | ノード + ホスト名 + LAG/MLAG（既定） |
 * | near   | 1.0–2.2    | + 速度/IF ラベル、lo_ip/AS、VLAN 詳細 |
 * | detail | k ≥ 2.2    | + MTU/BFD バッジ、ips 一覧 |
 *
 * 境界のチラつきを防ぐため ±10% のヒステリシスを持つ。
 */
import type { Lod } from '../GraphContext'

const BOUNDS: Record<Lod, [number, number]> = {
  far:    [0,    0.45],
  mid:    [0.45, 1.0],
  near:   [1.0,  2.2],
  detail: [2.2,  Infinity],
}
const HYSTERESIS = 0.05

function pick(k: number): Lod {
  if (k < 0.45) return 'far'
  if (k < 1.0)  return 'mid'
  if (k < 2.2)  return 'near'
  return 'detail'
}

export function lodFromZoom(k: number, prev: Lod | null): Lod {
  if (!prev) return pick(k)
  const cur = pick(k)
  if (cur === prev) return prev
  // 前の帯の境界を ±10% 超えるまでは前の LOD を維持
  const [lo, hi] = BOUNDS[prev]
  if (k >= lo * (1 - HYSTERESIS) && k <= hi * (1 + HYSTERESIS)) return prev
  return cur
}

/** ホスト名の部分逆スケール: ズームインしても文字が画面を占有しない */
export const hostnameFontSize = (lod: Lod): number =>
  lod === 'detail' ? 7.2 : lod === 'near' ? 8.8 : 11.5
