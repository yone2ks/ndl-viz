/**
 * LinkEdge — L1 物理リンク (フローティングエッジ)
 *
 * ノード矩形の境界交点を結ぶ直線。並列リンクは法線方向にオフセット。
 * LAG はエメラルドのグロー帯 + IEEE ティック、速度/IF/MTU ラベルは LOD 連動。
 */
import { memo } from 'react'
import { useInternalNode, useStore, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { edgeGeometry, arcGeometry } from './edgeGeometry'
import { linkStyle } from './palette'
import { useFlowCtx, lodOf, type Lod } from './FlowCtx'
import { useT } from '../i18n'
import type { CyEdgeData } from '../types/topology'

const lodSelector = (s: { transform: [number, number, number] }): Lod => lodOf(s.transform[2])

/** detour: 同じ段の離れた機器どうしのリンク。間のカードを避けて上を回る弧で描く */
type LinkData = CyEdgeData & { offsetIndex: number; offsetCount: number; showLabel: boolean; detour?: boolean }

export const LinkEdge = memo(function LinkEdge({ id, source, target, data, selected }: EdgeProps) {
  const d = data as unknown as LinkData
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const lod = useStore(lodSelector)
  const t = useT()
  const { hoveredId, overlays, vlanOnLink, ifIp, focusVlanId, setFocusVlanId,
    query, matchedIds, vniFocusNodes } = useFlowCtx()
  if (!sourceNode || !targetNode) return null

  const arc = d.detour ? arcGeometry(sourceNode, targetNode, d.offsetIndex, d.offsetCount) : null
  const geo = arc ?? edgeGeometry(sourceNode, targetNode, d.offsetIndex, d.offsetCount)
  const isLag = !!d.lag_id
  const { color, dash } = linkStyle(d.link_role ?? '', isLag)

  // このリンクを通る VLAN レール（L2 overlay ON 時）。弧のリンクには並走させない（直線に沿って描くため）
  const rails = overlays.has('l2') && !arc ? (vlanOnLink.get(id) ?? []) : []
  // VLAN カードをホバー中・VNI のフォーカスで残す VLAN: その VLAN が通るリンクは残す
  const isHot = (vlanId: string) => hoveredId === vlanId || !!vniFocusNodes?.has(vlanId)
  const hoveredRail = hoveredId !== null && rails.some(r => isHot(r.vlanId))
  const touches = hoveredId !== null
    && (source === hoveredId || target === hoveredId || hoveredRail)
  // 検索中は非マッチエッジを減光、マッチエッジは IF/IP を強制表示
  const searchActive = query !== ''
  const searchHit = searchActive && matchedIds.has(id)
  const dim = searchActive ? !searchHit : (hoveredId !== null && !touches)

  // L3 overlay ON のとき IF ラベルに IP を併記
  const showIfIp = overlays.has('l3')
  const srcIp = showIfIp && d.source_if ? ifIp.get(source)?.get(d.source_if) : undefined
  const tgtIp = showIfIp && d.target_if ? ifIp.get(target)?.get(d.target_if) : undefined
  const showLabels = (lod === 'near' || lod === 'detail') && d.showLabel
  // IF 名 + IP はプログレッシブ・ディスクロージャ:
  //   detail まで拡大(数ノードのみ表示) / ノードホバーでその周辺 / エッジ選択時
  // のいずれかでのみ表示し、IF が多くても一度に見えるのは手元の数本だけにする
  const nodeHovered = hoveredId === source || hoveredId === target
  const showIf = lod === 'detail' || nodeHovered || !!selected || searchHit
  const path = arc?.path ?? `M ${geo.sx},${geo.sy} L ${geo.tx},${geo.ty}`

  // IF ラベル位置 (端点から内側。IP 併記時は広め)
  const ifOff = overlays.has('l3') ? 46 : 34
  // 弧のリンクは端点から真上に出るので、IF ラベルも真上に置く
  const ifS = arc ? { x: geo.sx, y: geo.sy - ifOff } : { x: geo.sx + geo.nx * ifOff, y: geo.sy + geo.ny * ifOff }
  const ifT = arc ? { x: geo.tx, y: geo.ty - ifOff } : { x: geo.tx - geo.nx * ifOff, y: geo.ty - geo.ny * ifOff }

  // LAG ティック (//)
  const ticks = isLag ? [-7, 7].map(off => {
    const cx = geo.mx + geo.nx * off, cy = geo.my + geo.ny * off
    const T = 8
    return { x1: cx - geo.px * T + geo.nx * 3, y1: cy - geo.py * T + geo.ny * 3,
             x2: cx + geo.px * T - geo.nx * 3, y2: cy + geo.py * T - geo.ny * 3 }
  }) : []

  return (
    <g className={`link-edge${dim ? ' is-dim' : ''}${touches ? ' is-hot' : ''}${selected ? ' is-selected' : ''}`}>
      {/* LAG グロー帯 */}
      {isLag && (
        <path d={path} stroke={color} strokeWidth={11} strokeLinecap="round"
          opacity={0.16} fill="none" />
      )}
      <path d={path} stroke={color} strokeWidth={touches ? 3 : 2.2}
        strokeDasharray={dash} strokeLinecap="round" fill="none"
        className="link-line" />
      {/* クリック領域 */}
      <path d={path} stroke="transparent" strokeWidth={16} fill="none"
        className="react-flow__edge-interaction" />
      {ticks.map((t, i) => (
        <line key={i} {...t} stroke={color} strokeWidth={2} strokeLinecap="round" />
      ))}

      {/* ── VLAN レール: リンクに並走するビーズ（点列）。物理 = 実線/破線、
            VLAN = 点列で見分ける。フォーカス中の VLAN は実線+グローに変化 ── */}
      {rails.map((r, ri) => {
        const base = (isLag ? 11 : 8) + 5 + ri * 5.5
        const ox = geo.px * base, oy = geo.py * base
        const hot = isHot(r.vlanId)
        const railDim = hoveredId !== null && !hot
        return (
          <line key={r.vlanId}
            x1={geo.sx + ox} y1={geo.sy + oy} x2={geo.tx + ox} y2={geo.ty + oy}
            stroke={`hsl(${r.hue}, 78%, 55%)`}
            strokeWidth={hot ? 5 : 3.6}
            strokeLinecap="round"
            strokeDasharray={hot ? undefined : '0.1 8'}
            className={`vlan-rail${hot ? ' is-hot' : ''}`}
            opacity={railDim ? 0.10 : 0.95} />
        )
      })}
      {/* レールの VLAN ID チップ（near 以上・中央線のみ）。
          クリックでその VLAN にフォーカス。フォーカス中は他 VLAN のチップを消す */}
      {(() => {
        const chipRails = focusVlanId ? rails.filter(r => r.vlanId === focusVlanId || isHot(r.vlanId)) : rails
        if (chipRails.length === 0 || !(lod === 'near' || lod === 'detail') || !d.showLabel) return null
        return (
          <EdgeLabelRenderer>
            <div className={`vlan-rail-chips${dim ? ' is-dim' : ''}`}
              style={{ transform: `translate(-50%,-50%) translate(${geo.mx - geo.px * (14 + chipRails.length * 4)}px,${geo.my - geo.py * (14 + chipRails.length * 4)}px)` }}>
              {chipRails.map(r => (
                <button key={r.vlanId} type="button"
                  className={`vlan-rail-chip${focusVlanId === r.vlanId ? ' is-focused' : ''}`}
                  style={{ '--rail': `hsl(${r.hue}, 75%, 48%)` } as React.CSSProperties}
                  data-tip={t.vlanFocus(r.vlanNum)}
                  onClick={e => {
                    e.stopPropagation()
                    setFocusVlanId(focusVlanId === r.vlanId ? null : r.vlanId)
                  }}>
                  {r.vlanNum}
                </button>
              ))}
            </div>
          </EdgeLabelRenderer>
        )
      })()}

      <EdgeLabelRenderer>
        {showLabels && d.link_speed && (
          <div className={`edge-pill speed-pill${dim ? ' is-dim' : ''}`}
            style={{ transform: `translate(-50%,-50%) translate(${geo.mx + geo.px * 16}px,${geo.my + geo.py * 16}px)` }}>
            {d.link_speed}
            {lod === 'detail' && d.mtu ? <span className="mtu"> · MTU {d.mtu}</span> : null}
          </div>
        )}
        {showIf && d.source_if && (
          <div className={`edge-if${srcIp ? ' has-ip' : ''}${dim ? ' is-dim' : ''}`}
            style={{ transform: `translate(-50%,-50%) translate(${ifS.x}px,${ifS.y}px)` }}>
            <span className="if-name">{d.source_if}</span>
            {srcIp && <span className="if-ip">{srcIp}</span>}
          </div>
        )}
        {showIf && d.target_if && (
          <div className={`edge-if${tgtIp ? ' has-ip' : ''}${dim ? ' is-dim' : ''}`}
            style={{ transform: `translate(-50%,-50%) translate(${ifT.x}px,${ifT.y}px)` }}>
            <span className="if-name">{d.target_if}</span>
            {tgtIp && <span className="if-ip">{tgtIp}</span>}
          </div>
        )}
      </EdgeLabelRenderer>
    </g>
  )
})
