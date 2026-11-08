/**
 * PhysicalLinks — L1 物理リンク（並列線 + IF/速度ラベル + LAG ティック）
 *
 * ラベルは LOD で出し分け:
 *   near 以上 → 速度 / IF ラベル（グリッドハッシュで衝突間引き）
 */
import { memo, useMemo } from 'react'
import { useGraphCtx } from '../GraphContext'
import { edgePts, type EP } from '../geometry'
import { LINK_COLOR, LINK_DASH, LAG_COLOR } from '../theme'
import { cullLabels, type LabelItem } from '../utils/labelCulling'
import type { NodeLayout } from '../layout'
import type { CyEdgeData } from '../../../types/topology'

interface Props {
  pairMap: Map<string, CyEdgeData[]>
  effectiveNodeMap: Map<string, NodeLayout>
}

interface LinkEntry { d: CyEdgeData; idx: number; total: number; pts: EP }

export const PhysicalLinks = memo(function PhysicalLinks({ pairMap, effectiveNodeMap }: Props) {
  const { theme, ui, onSelect, hoveredId, lod } = useGraphCtx()

  const showLinkLabels = lod === 'near' || lod === 'detail'

  // 座標を一度だけ計算
  const entries = useMemo<LinkEntry[]>(() => {
    const list: LinkEntry[] = []
    pairMap.forEach(links => {
      links.forEach((d, i) => {
        const src = effectiveNodeMap.get(d.source), tgt = effectiveNodeMap.get(d.target)
        if (!src || !tgt) return
        list.push({ d, idx: i, total: links.length, pts: edgePts(src, tgt, i, links.length) })
      })
    })
    return list
  }, [pairMap, effectiveNodeMap])

  // ラベル衝突間引き（速度 > IF）
  const visibleLabels = useMemo(() => {
    if (!showLinkLabels) return new Set<string>()
    const items: LabelItem[] = []
    entries.forEach(({ d, idx, total, pts }) => {
      const isMidLine = idx === Math.floor((total - 1) / 2)
      if (isMidLine && d.link_speed) {
        items.push({ key: `${d.id}:speed`, x: pts.mx + pts.py * 11, y: pts.my - pts.px * 11,
          w: d.link_speed.length * 6, h: 10, priority: 3 })
      }
      if (d.source_if) items.push({ key: `${d.id}:sif`, x: pts.ifx1, y: pts.ify1,
        w: d.source_if.length * 5.5, h: 9, priority: 2 })
      if (d.target_if) items.push({ key: `${d.id}:tif`, x: pts.ifx2, y: pts.ify2,
        w: d.target_if.length * 5.5, h: 9, priority: 2 })
    })
    return cullLabels(items)
  }, [entries, showLinkLabels])

  return (
    <>
      {entries.map(({ d, idx, total, pts }) => {
        const isLag   = !!d.lag_id
        const color   = isLag
          ? LAG_COLOR.line
          : (LINK_COLOR[d.link_role ?? ''] ?? ui.linkDefault)
        const dash    = isLag ? '' : (LINK_DASH[d.link_role ?? ''] ?? '')
        // fog-of-war: ホバーノードに接続するリンクを強調、それ以外を減光
        const touches = hoveredId !== null && (d.source === hoveredId || d.target === hoveredId)
        const dim     = hoveredId !== null && !touches
        const sw      = (isLag ? 2.2 : 2.0) + (touches ? 0.8 : 0)
        const showLabels = idx === Math.floor((total - 1) / 2)
        return (
          <g key={d.id} className={`clickable fog-able build-line${dim ? ' fog-dim' : ''}`} style={{ cursor:'pointer' }}
             onClick={e => { e.stopPropagation(); onSelect({ data: d }) }}>
            <line x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
              stroke={color} strokeWidth={sw}
              strokeDasharray={dash || undefined} strokeLinecap="round" />
            {/* 透明なクリック領域（細い線を選択しやすく）*/}
            <line x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
              stroke="transparent" strokeWidth={12} />

            {/* LAG 各線ハイライトポリゴン（線を中心に左右に広げた帯）*/}
            {isLag && (() => {
              const HW = 5  // 半幅 px
              const { x1, y1, x2, y2, px: pvx, py: pvy } = pts
              const polyFill = theme === 'dark' ? 'rgba(5,150,105,0.18)' : 'rgba(5,150,105,0.13)'
              const polyPts = [
                `${x1 + pvx * HW},${y1 + pvy * HW}`,
                `${x1 - pvx * HW},${y1 - pvy * HW}`,
                `${x2 - pvx * HW},${y2 - pvy * HW}`,
                `${x2 + pvx * HW},${y2 + pvy * HW}`,
              ].join(' ')
              return (
                <polygon points={polyPts} fill={polyFill}
                  style={{ pointerEvents: 'none' }} />
              )
            })()}

            {/* リンク速度ラベル（near 以上・中央の線のみ）*/}
            {showLinkLabels && showLabels && d.link_speed && visibleLabels.has(`${d.id}:speed`) && (
              <text
                x={pts.mx + pts.py * 11} y={pts.my - pts.px * 11}
                fill={ui.speedText} fontSize={8.5} textAnchor="middle" dominantBaseline="middle"
                className="lod-fade"
                style={{ fontFamily:'"SF Mono","Fira Code",monospace', pointerEvents:'none' }}>
                {d.link_speed}
              </text>
            )}

            {/* IF ラベル: source / target 側（near 以上）*/}
            {showLinkLabels && d.source_if && visibleLabels.has(`${d.id}:sif`) && (
              <text x={pts.ifx1} y={pts.ify1}
                fill={ui.ifText} fontSize={7.5} textAnchor="middle" dominantBaseline="middle"
                className="lod-fade"
                style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
                {d.source_if}
              </text>
            )}
            {showLinkLabels && d.target_if && visibleLabels.has(`${d.id}:tif`) && (
              <text x={pts.ifx2} y={pts.ify2}
                fill={ui.ifText} fontSize={7.5} textAnchor="middle" dominantBaseline="middle"
                className="lod-fade"
                style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
                {d.target_if}
              </text>
            )}

            {/* LAG ティックマーク（IEEE // 標準 — FAT バンドの代替）*/}
            {isLag && Math.hypot(pts.x2 - pts.x1, pts.y2 - pts.y1) > 40 && (
              ([-6, 6] as const).map((off, ti) => {
                const len = Math.hypot(pts.x2 - pts.x1, pts.y2 - pts.y1) || 1
                const nx = (pts.x2 - pts.x1) / len, ny = (pts.y2 - pts.y1) / len
                const tx = pts.mx + nx * off, ty = pts.my + ny * off
                const TICK = 7
                return (
                  <line key={`tick-${ti}`}
                    x1={tx - (-ny) * TICK} y1={ty - nx * TICK}
                    x2={tx + (-ny) * TICK} y2={ty + nx * TICK}
                    stroke={color} strokeWidth={1.5} strokeLinecap="round"
                    style={{ pointerEvents: 'none' }} />
                )
              })
            )}
          </g>
        )
      })}
    </>
  )
})
