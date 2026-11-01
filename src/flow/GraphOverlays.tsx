/**
 * GraphOverlays — tier 帯 / MLAG ドメイン / VLAN ハルの背景描画
 *
 * ViewportPortal でフロー座標系に SVG を重ね、ノードのドラッグに追随する。
 */
import { memo } from 'react'
import { ViewportPortal, useNodes, type Node } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import { CARD_W, CARD_H, type TierInfo, type SiteInfo } from './layout'

interface Props {
  tiers: TierInfo[]
  sites: SiteInfo[]
  mlagDomains: Map<string, string[]>
  graphW: number
}

function nodeBox(n: Node | undefined) {
  if (!n) return null
  const w = n.measured?.width ?? CARD_W
  const h = n.measured?.height ?? CARD_H
  return { x: n.position.x, y: n.position.y, w, h, cx: n.position.x + w / 2, cy: n.position.y + h / 2 }
}

export const GraphOverlays = memo(function GraphOverlays({ tiers, sites, mlagDomains }: Props) {
  const nodes = useNodes()
  const byId = new Map(nodes.map(n => [n.id, n]))
  const { hoveredId } = useFlowCtx()
  const SP = 40   // サイトボックスの余白

  return (
    <ViewportPortal>
      <svg className="graph-underlay" width="1" height="1" style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        {/* ── サイト境界ボックス + ラベル ── */}
        {sites.map(s => (
          <g key={`site-${s.id}`} className="site-box">
            <rect x={s.xLeft - SP} y={s.yTop - SP} rx={20}
              width={(s.xRight - s.xLeft) + SP * 2} height={(s.yBot - s.yTop) + SP * 2} />
            <text x={s.xLeft - SP + 18} y={s.yTop - SP - 12} className="site-label">
              {s.label}
            </text>
          </g>
        ))}

        {/* ── Tier 区切り（サイトごとに X 範囲を限定）── */}
        {tiers.map((t, i) => (
          <g key={`tier-${i}`}>
            <text x={t.xLeft - SP - 10} y={(t.yTop + t.yBot) / 2}
              className="tier-label" textAnchor="end" dominantBaseline="middle">
              {t.label}
            </text>
            {/* 同サイト内で次の tier との境界に区切り線 */}
            {tiers[i + 1] && tiers[i + 1].xLeft === t.xLeft && (
              <line className="tier-sep"
                x1={t.xLeft - SP} y1={(t.yEnd + tiers[i + 1].yTop) / 2}
                x2={t.xRight + SP} y2={(t.yEnd + tiers[i + 1].yTop) / 2} />
            )}
          </g>
        ))}

        {/* ── MLAG ドメイン ── */}
        {Array.from(mlagDomains.entries()).map(([lagId, ids]) => {
          const boxes = ids.map(id => nodeBox(byId.get(id))).filter((b): b is NonNullable<typeof b> => !!b)
          if (boxes.length < 2) return null
          const PAD = 26
          const x1 = Math.min(...boxes.map(b => b.x)) - PAD
          const y1 = Math.min(...boxes.map(b => b.y)) - PAD - 6
          const x2 = Math.max(...boxes.map(b => b.x + b.w)) + PAD
          const y2 = Math.max(...boxes.map(b => b.y + b.h)) + PAD
          const dim = hoveredId !== null && !ids.includes(hoveredId)
          return (
            <g key={`mlag-${lagId}`} className={`mlag-box${dim ? ' is-dim' : ''}`}>
              <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={16} />
              <text x={x1 + 12} y={y1 + 18}>MLAG DOMAIN</text>
            </g>
          )
        })}
      </svg>
    </ViewportPortal>
  )
})
