/**
 * FlowLegend — 線の凡例（キャンバス左上）
 *
 * 今表示している層の線のうち、データにあるものだけを並べる。名前は YAML に書かれた値
 * （link_role・routing_adjacencies の type 等）をそのまま出す。
 * セッションの行は、制御プレーンのボタンの ▾ で選んだプロトコル・AF のものだけ。凡例は線の見方を示すだけで、
 * 出し入れはボタンの ▾ でする。
 */
import { memo, useMemo, useState } from 'react'
import { Panel, type Edge } from '@xyflow/react'
import { linkStyle, OVERLAY_STYLE, type LineStyle } from './palette'
import { protocolLabel, sessionShown, type CpView } from './session'
import { useT } from '../i18n'
import type { CyEdgeData, OverlayKey } from '../types/topology'

/** linkStyle で見た目が分かれる link_role。ほかの値は 1 行にまとめて名前を並べる */
const STYLED_ROLES = ['underlay', 'peer-link', 'management']

interface Row { key: string; style: LineStyle; label: string; lag?: boolean }

interface Props {
  edges: Edge[]
  overlays: Set<OverlayKey>
  cp: CpView
}

export const FlowLegend = memo(function FlowLegend({ edges, overlays, cp }: Props) {
  const t = useT()
  const [open, setOpen] = useState(true)

  const { l1, other } = useMemo(() => {
    const data = edges.map(e => e.data as unknown as CyEdgeData)
    // L1: LAG、見た目が分かれる link_role、それ以外の link_role（まとめて 1 行）
    const l1: Row[] = []
    const links = data.filter(d => d.type === 'link')
    if (links.some(d => d.lag_id)) l1.push({ key: 'lag', style: linkStyle('', true), label: 'LAG', lag: true })
    STYLED_ROLES.forEach(r => {
      if (links.some(d => !d.lag_id && d.link_role === r)) l1.push({ key: r, style: linkStyle(r, false), label: r })
    })
    const rest = [...new Set(links.filter(d => !d.lag_id && !STYLED_ROLES.includes(d.link_role ?? ''))
      .map(d => d.link_role || t.legendNoRole))]
    if (rest.length) l1.push({ key: 'other', style: linkStyle('', false), label: rest.join(' · ') })

    // オーバーレイ: 表示中の層のものだけ
    const other: Row[] = []
    const has = (type: string) => data.some(d => d.type === type)
    if (has('attaches_to')) other.push({ key: 'attach', style: OVERLAY_STYLE.attach, label: 'attaches_to' })
    if (overlays.has('l2') && has('vlan_member')) {
      other.push({ key: 'vlan', style: OVERLAY_STYLE.vlan, label: t.legendVlanPort })
    }
    // 範囲 (選んだ機器だけ) では絞らない。機器を選ぶ前にも線の見方を出しておく
    const sessions = overlays.has('cp')
      ? data.filter(d => d.type === 'routing_neighbor' && sessionShown(d, { ...cp, scope: 'all' }, null)) : []
    const adj = [...new Set(sessions.filter(d => d.protocol !== 'bgp').map(d => d.protocol ?? ''))]
    if (adj.length) {
      other.push({ key: 'adj', style: OVERLAY_STYLE.routing, label: adj.map(protocolLabel).join(' · ') })
    }
    const bgp = sessions.filter(d => d.protocol === 'bgp')
    if (bgp.some(d => d.bgp_type === 'ebgp')) other.push({ key: 'ebgp', style: OVERLAY_STYLE.ebgp, label: 'eBGP' })
    if (bgp.some(d => d.bgp_type === 'ibgp')) other.push({ key: 'ibgp', style: OVERLAY_STYLE.ibgp, label: 'iBGP' })
    if (bgp.some(d => !d.bgp_type)) other.push({ key: 'bgp', style: OVERLAY_STYLE.routing, label: t.legendBgpUntyped })
    return { l1, other }
  }, [edges, overlays, cp, t])

  return (
    <Panel position="top-left" className="flow-legend">
      <button type="button" className="legend-head" onClick={() => setOpen(o => !o)}>
        {t.legend} <span className="legend-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="legend-body">
          {[...l1, ...other].map(r => (
            <div key={r.key} className="legend-row">
              <svg width="30" height="10" aria-hidden="true">
                {r.lag && <line x1="2" y1="5" x2="28" y2="5" stroke={r.style.color} strokeWidth="8"
                  strokeLinecap="round" opacity="0.16" />}
                <line x1="2" y1="5" x2="28" y2="5" stroke={r.style.color} strokeWidth={r.style.width}
                  strokeDasharray={r.style.dash} strokeLinecap="round" />
              </svg>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
})
