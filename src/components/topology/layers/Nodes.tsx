/**
 * Nodes — L1 ノード（最前面）。アイコン or 幾何シェイプ + ラベル + overlay 連動情報
 */
import { memo, type RefObject } from 'react'
import { useGraphCtx } from '../GraphContext'
import { Shape } from '../Shape'
import { rcfg, vrfColor } from '../theme'
import { hostnameFontSize } from '../utils/lod'
import { soleAddress } from '../../../flow/l3'
import type { NodeLayout } from '../layout'
import type { IconRenderer } from '../../../icons/networkIcons'

interface NodeDragState { id: string; moved: boolean }

interface Props {
  effectiveNodeLayouts: NodeLayout[]
  icons: Record<string, IconRenderer>
  nodeDrag: RefObject<NodeDragState | null>
  onNodeMouseDown: (e: React.MouseEvent, id: string) => void
  /** tier 順スタガー構築アニメーション用 */
  nodeTier: Map<string, number>
}

export const Nodes = memo(function Nodes({ effectiveNodeLayouts, icons, nodeDrag, onNodeMouseDown, nodeTier }: Props) {
  const { theme, ui, overlays, onSelect, hoveredId, setHoveredId, selectedId, adjacency, lod } = useGraphCtx()
  const showDetail = lod === 'detail'
  const showNear   = lod === 'near' || lod === 'detail'
  const fontSize   = hostnameFontSize(lod)
  return (
    <>
      {effectiveNodeLayouts.map(n => {
        const cfg = rcfg(n.data.role, theme)
        const IconComp = icons[n.data.role ?? '']
        const labelY = n.y + n.h / 2 + 16

        // overlay × LOD 連動の埋め込み情報（near 以上で表示）
        // L3 IF が 1 つだけのノードはそのアドレス。代表アドレスは選ばない (mlndl ADR-0011 D11)
        const sole      = showNear && overlays.has('l3') ? soleAddress(n.data) : undefined
        const showAs    = showNear && overlays.has('bgp') && n.data.local_as
        // detail: L3 IF の一覧（ホスト名の下。名前とアドレス）
        const ipList    = showDetail
          ? (n.data.l3_interfaces ?? []).filter(e => e.ip || e.ipv6).slice(0, 4).map(e => `${e.name} ${e.ip || e.ipv6}`)
          : []
        // VRF チップ（near 以上 + L3 overlay。vrf-default は省略）
        const vrfList   = showNear && overlays.has('l3')
          ? (n.data.vrfs ?? []).filter(v => v !== 'vrf-default') : []

        // fog-of-war: ホバー中、本人でも隣接でもないノードを減光
        const dim = hoveredId !== null && hoveredId !== n.id
          && !adjacency.get(hoveredId)?.has(n.id)
        const isSel = selectedId === n.id

        return (
          <g key={n.id} className={`clickable fog-able build-in${dim ? ' fog-dim' : ''}`}
             style={{ cursor: nodeDrag.current?.id === n.id ? 'grabbing' : 'grab',
                      animationDelay: `${(nodeTier.get(n.id) ?? 0) * 60}ms` }}
             onMouseEnter={() => setHoveredId(n.id)}
             onMouseLeave={() => setHoveredId(null)}
             onMouseDown={e => onNodeMouseDown(e, n.id)}
             onClick={e => {
               e.stopPropagation()
               if (!nodeDrag.current?.moved) onSelect({ data: n.data })
             }}>

            {/* 選択ハイライト: グロー付きアウトライン + パルス */}
            {isSel && (
              <g className="sel-pulse" filter="url(#sel-glow)" style={{ pointerEvents:'none' }}>
                <Shape x={n.x} y={n.y} w={n.w + 10} h={n.h + 10}
                  shape={cfg.shape} fill="none" stroke={cfg.stroke} />
              </g>
            )}

            {/* アイコン（登録済み）or フォールバックの幾何図形
                Dark テーマではネオングロー filter を適用（アート要素） */}
            <g filter={theme === 'dark' ? 'url(#node-glow)' : undefined}>
              {IconComp
                ? IconComp({ cx: n.x, cy: n.y, w: n.w, h: n.h, fill: cfg.fill, stroke: cfg.stroke })
                : <Shape x={n.x} y={n.y} w={n.w} h={n.h}
                    shape={cfg.shape} fill={cfg.fill} stroke={cfg.stroke} />
              }
            </g>

            {/* L3 IF が 1 つだけのノードのアドレス — shape 内部（L3 overlay）*/}
            {sole && (
              <text x={n.x} y={n.y + 3}
                fill={ui.labelDim} fontSize={8} textAnchor="middle" dominantBaseline="middle"
                style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
                {sole}
              </text>
            )}

            {/* AS 番号 — shape 内部下部（BGP overlay）*/}
            {showAs && (
              <text x={n.x} y={n.y + n.h / 2 - 6}
                fill={cfg.stroke} fontSize={7.5} textAnchor="middle" dominantBaseline="middle"
                style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none', opacity: 0.85 }}>
                {`AS${n.data.local_as}`}
              </text>
            )}

            {/* ホスト名ラベル（shape 下・LOD で部分逆スケール）*/}
            <text x={n.x} y={labelY}
              fill={ui.labelText} fontSize={fontSize} textAnchor="middle" dominantBaseline="hanging"
              style={{ fontFamily:'"SF Mono","Fira Code",monospace', fontWeight:600, pointerEvents:'none' }}>
              {n.data.label}
            </text>

            {/* IP 一覧（detail のみ・ホスト名の下）*/}
            {ipList.map((ip, li) => (
              <text key={li} x={n.x} y={labelY + fontSize + 4 + li * 9}
                fill={ui.labelDim} fontSize={6.5} textAnchor="middle" dominantBaseline="hanging"
                className="lod-fade"
                style={{ fontFamily:'"SF Mono",monospace', pointerEvents:'none' }}>
                {ip}
              </text>
            ))}

            {/* VRF チップ（near 以上 + L3 overlay・ノード右上）*/}
            {vrfList.map((vrf, vi) => {
              const clr = vrfColor(vrf, theme)
              const label = vrf.replace(/^vrf-/, '')
              const chipW = label.length * 5.4 + 10
              const cy0 = n.y - n.h / 2 - 10 - vi * 14
              return (
                <g key={vrf} className="lod-fade" style={{ pointerEvents:'none' }}>
                  <rect x={n.x + n.w / 2 - chipW / 2} y={cy0 - 6}
                    width={chipW} height={12} rx={6}
                    fill={theme === 'dark' ? 'rgba(10,12,20,0.85)' : 'rgba(255,255,255,0.9)'}
                    stroke={clr} strokeWidth={1} />
                  <text x={n.x + n.w / 2} y={cy0 + 1}
                    fill={clr} fontSize={7} fontWeight={600}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontFamily:'"SF Mono",monospace' }}>
                    {label}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </>
  )
})
