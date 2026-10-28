/**
 * VlanNodes — VLAN ノード（L2 overlay 有効時）
 * サブネット / ゲートウェイ情報を amber ピル形式で表示
 */
import { memo } from 'react'
import { useGraphCtx } from '../GraphContext'
import type { NodeLayout } from '../layout'
import type { CyNodeData } from '../../../types/topology'

interface Props {
  vlanLayouts: NodeLayout[]
  /** VLAN ↔ VNI バインディング（RFC8345 supporting 関係のバッジ表示） */
  vniByVlan: Map<string, CyNodeData[]>
}

export const VlanNodes = memo(function VlanNodes({ vlanLayouts, vniByVlan }: Props) {
  const { theme, ui, overlays, onSelect, lod } = useGraphCtx()
  // 詳細行 (subnet / GW / VRF) は near 以上で表示。mid はタイトルのみ
  const showRows = lod === 'near' || lod === 'detail'
  // 常時レンダリングし opacity で表示切替（フェードトランジション）
  const visible = overlays.has('l2')
  return (
    <>
      {vlanLayouts.map(vn => {
        const vd = vn.data
        const amber     = theme === 'dark' ? '#F59E0B' : '#B45309'
        const amberFill = theme === 'dark' ? 'rgba(245,158,11,0.10)' : 'rgba(180,83,9,0.07)'
        // ラベル行の組み立て
        const titleLine = vd.label?.split('\n')[0] ?? vd.id  // "VLAN 100"
        const nameLine  = showRows ? vd.label?.split('\n')[1] : undefined  // "tenant-a"
        const subnetLine = showRows ? vd.subnet : undefined   // "192.168.100.0/24"
        const gwLine    = showRows && vd.gateway ? `GW: ${vd.gateway}` : null
        const vrfLine   = showRows && vd.vrf_name ? `VRF: ${vd.vrf_name}` : null

        // 行数に応じてボックス高さを動的に
        const rows = [nameLine, subnetLine, gwLine || vrfLine].filter(Boolean).length
        const boxH = 24 + rows * 13
        const boxW = vn.w

        // テキスト行配列
        const bodyLines = [nameLine, subnetLine, gwLine ?? vrfLine].filter((s): s is string => !!s)

        return (
          <g key={vn.id} className={`clickable ov-able${visible ? '' : ' ov-off'}`}
             style={{ cursor: 'pointer' }}
             onClick={e => { e.stopPropagation(); onSelect({ data: vd }) }}>
            <rect x={vn.x - boxW / 2} y={vn.y - boxH / 2}
              width={boxW} height={boxH} rx={8}
              fill={amberFill} stroke={amber} strokeWidth={1.4} />
            {/* VLAN ID タイトル */}
            <text x={vn.x} y={vn.y - boxH / 2 + 12}
              fill={amber} fontSize={9.5} fontWeight={700} textAnchor="middle"
              style={{ fontFamily: '"SF Mono","Fira Code",monospace', pointerEvents: 'none',
                       letterSpacing: '0.04em' }}>
              {titleLine}
            </text>
            {/* 追加情報行 */}
            {bodyLines.map((line, li) => (
              <text key={li} x={vn.x} y={vn.y - boxH / 2 + 25 + li * 13}
                fill={li === 0 && nameLine ? ui.speedText : ui.labelDim}
                fontSize={8} textAnchor="middle"
                style={{ fontFamily: '"SF Mono",monospace', pointerEvents: 'none' }}>
                {line}
              </text>
            ))}

            {/* VNI バッジ（ピル右上に吸着 — supporting 関係の表現）*/}
            {(vniByVlan.get(vn.id) ?? []).map((vni, bi) => {
              const tag = vni.type === 'l3vni' ? `L3VNI ${vni.vni}` : `VNI ${vni.vni}`
              const bw = tag.length * 5.6 + 10
              const bx = vn.x + boxW / 2 - 8
              const by = vn.y - boxH / 2 - 7 + bi * 15
              return (
                <g key={vni.id} style={{ pointerEvents: 'none' }}>
                  <rect x={bx - bw / 2} y={by - 6} width={bw} height={13} rx={3}
                    fill={theme === 'dark' ? 'rgba(20,12,2,0.92)' : 'rgba(255,251,235,0.95)'}
                    stroke={amber} strokeWidth={1} />
                  <text x={bx} y={by + 1}
                    fill={amber} fontSize={7.5} fontWeight={700}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontFamily: '"SF Mono",monospace' }}>
                    {tag}
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
