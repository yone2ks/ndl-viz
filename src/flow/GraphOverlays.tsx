/**
 * GraphOverlays — tier 帯 / Ethernet Segment の枠 / VLAN ハルの背景描画
 *
 * ViewportPortal でフロー座標系に SVG を重ね、ノードのドラッグに追随する。
 * サイトの枠は、属する機器と VLAN の札の今の位置から求める（動かしたノードを含むように広がる）。
 * カードの高さは拡大率で変わるので、測った高さではなく見積もりの高さで囲む（拡大しても枠が動かない）。
 */
import { memo } from 'react'
import { ViewportPortal, useNodes, type Node } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import { CARD_W, CARD_H, VLAN_PILL_H, type TierInfo, type SiteInfo, type SegmentFrame } from './layout'

interface Props {
  tiers: TierInfo[]
  sites: SiteInfo[]
  segmentFrames: SegmentFrame[]
  siteIdOf: Map<string, number>
  cardHeights: Map<string, number>
  graphW: number
}

/** サイトの上の余白（最上段のカードの上端からサイトの yTop まで）*/
const SITE_TOP = 40

function nodeBox(n: Node | undefined) {
  if (!n) return null
  const w = n.measured?.width ?? CARD_W
  const h = n.measured?.height ?? CARD_H
  return { x: n.position.x, y: n.position.y, w, h, cx: n.position.x + w / 2, cy: n.position.y + h / 2 }
}

export const GraphOverlays = memo(function GraphOverlays({ tiers, sites, segmentFrames, siteIdOf, cardHeights }: Props) {
  const nodes = useNodes()
  const byId = new Map(nodes.map(n => [n.id, n]))
  const { hoveredId, bundle } = useFlowCtx()
  const SP = 40   // サイトボックスの余白

  const siteBoxes = sites.map(s => {
    const members = nodes.filter(n => siteIdOf.get(n.id) === s.id)
    if (members.length === 0) return s
    const heightOf = (n: Node) => n.type === 'vlan' ? VLAN_PILL_H : cardHeights.get(n.id) ?? CARD_H
    return {
      ...s,
      xLeft: Math.min(...members.map(n => n.position.x)),
      xRight: Math.max(...members.map(n => n.position.x + (n.measured?.width ?? CARD_W))),
      yTop: Math.min(...members.map(n => n.position.y)) - SITE_TOP,
      yBot: Math.max(...members.map(n => n.position.y + heightOf(n))),
    }
  })

  return (
    <ViewportPortal>
      <svg className="graph-underlay" width="1" height="1" style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        {/* ── サイト境界ボックス + ラベル（labels.site があるものだけ。ADR-0017 D1）── */}
        {siteBoxes.filter(s => s.label).map(s => (
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
            <text x={siteBoxes[t.site].xLeft - SP - 10} y={(t.yTop + t.yBot) / 2}
              className="tier-label" textAnchor="end" dominantBaseline="middle">
              {t.label}
            </text>
            {/* 同サイト内で次の tier との境界に区切り線 */}
            {tiers[i + 1] && tiers[i + 1].site === t.site && (
              <line className="tier-sep"
                x1={siteBoxes[t.site].xLeft - SP} y1={(t.yEnd + tiers[i + 1].yTop) / 2}
                x2={siteBoxes[t.site].xRight + SP} y2={(t.yEnd + tiers[i + 1].yTop) / 2} />
            )}
          </g>
        ))}

        {/* ── Ethernet Segment の枠 (脚の機器を囲む。mlndl ADR-0023) ── */}
        {segmentFrames.map(({ id: frameId, label, nodes: ids, segments }) => {
          const boxes = ids.map(id => nodeBox(byId.get(id))).filter((b): b is NonNullable<typeof b> => !!b)
          if (boxes.length < 2) return null
          const PAD = 26
          const x1 = Math.min(...boxes.map(b => b.x)) - PAD
          const y1 = Math.min(...boxes.map(b => b.y)) - PAD - 6
          const x2 = Math.max(...boxes.map(b => b.x + b.w)) + PAD
          const y2 = Math.max(...boxes.map(b => b.y + b.h)) + PAD
          // リンクの LAG / ES の組にフォーカス中は、その組の ES の枠を目立たせ、ほかは薄くする
          const hot = !!bundle && segments.some(s => bundle.segments.has(s))
          const dim = bundle ? !hot : hoveredId !== null && !ids.includes(hoveredId)
          return (
            <g key={`es-${frameId}`} className={`mlag-box${dim ? ' is-dim' : ''}${hot ? ' is-hot' : ''}`}>
              <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={16} />
              <text x={x1 + 12} y={y1 + 18}>{label}</text>
            </g>
          )
        })}
      </svg>
    </ViewportPortal>
  )
})
