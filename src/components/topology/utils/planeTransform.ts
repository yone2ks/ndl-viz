/**
 * planeTransform.ts — 2.5D Stack ビューの平面変換
 *
 * 各レイヤー平面に shear + 縦圧縮のアフィン変換をかけて斜めパネル風に積む。
 *   x' = x + SHEAR * y + tx(plane)
 *   y' = SQUASH * y + ty(plane)
 *
 * 平面 index: 0 = L1 (最下段), 1 = L2, 2 = L3/BGP (最上段)
 */

export const SHEAR  = -0.45   // y に比例した x シフト（左へ傾く）
export const SQUASH = 0.5     // 縦圧縮率

export interface PlaneOffsets { gap: number; xShift: number }

/** graphH からプレーン間ギャップを計算 */
export function planeOffsets(graphH: number): PlaneOffsets {
  return { gap: graphH * SQUASH + 110, xShift: 36 }
}

/** plane の SVG transform 文字列 (CSS transform としても有効な matrix) */
export function planeMatrix(plane: number, graphH: number): string {
  const { gap, xShift } = planeOffsets(graphH)
  // 上の平面ほど Y が小さい（plane 2 が最上段）
  const ty = (2 - plane) * gap
  const tx = plane * xShift
  return `matrix(1, 0, ${SHEAR}, ${SQUASH}, ${tx}, ${ty})`
}

/** グラフ座標 (x,y) を plane 変換後のルート座標へ（層間 supporting 線用） */
export function toPlane(plane: number, x: number, y: number, graphH: number): { x: number; y: number } {
  const { gap, xShift } = planeOffsets(graphH)
  return {
    x: x + SHEAR * y + plane * xShift,
    y: SQUASH * y + (2 - plane) * gap,
  }
}

/** Stack ビュー全体の概算高さ（フィット用） */
export function stackExtent(graphW: number, graphH: number): { w: number; h: number } {
  const { gap } = planeOffsets(graphH)
  return { w: graphW + Math.abs(SHEAR) * graphH + 80, h: gap * 2 + graphH * SQUASH + 80 }
}
