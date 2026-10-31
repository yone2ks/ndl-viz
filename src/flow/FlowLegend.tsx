/**
 * FlowLegend — 線の凡例（キャンバス左上）
 *
 * 今表示している層の線のうち、データにあるものだけを並べる。名前は YAML に書かれた値
 * （link_role・routing_adjacencies の type 等）をそのまま出す。
 * BGP の行には protocols.bgp の role を並べ、押すとその役割のセッションを隠す / 出す。
 */
import { memo, useMemo, useState } from 'react'
import { Panel, type Edge } from '@xyflow/react'
import { linkStyle, OVERLAY_STYLE, type LineStyle } from './palette'
import { useT } from '../i18n'
import type { CyEdgeData, OverlayKey } from '../types/topology'

const ADJ_LABEL: Record<string, string> = { bgp: 'BGP', ospf: 'OSPF', isis: 'IS-IS' }
/** linkStyle で見た目が分かれる link_role。ほかの値は 1 行にまとめて名前を並べる */
const STYLED_ROLES = ['underlay', 'peer-link', 'wan', 'management']

interface Row { key: string; style: LineStyle; label: string; lag?: boolean }

interface Props {
  edges: Edge[]
  overlays: Set<OverlayKey>
  hiddenBgpRoles: Set<string>
  onToggleBgpRole: (role: string) => void
}

export const FlowLegend = memo(function FlowLegend({ edges, overlays, hiddenBgpRoles, onToggleBgpRole }: Props) {
  const t = useT()
  const [open, setOpen] = useState(true)

  const { l1, other, bgpRoles } = useMemo(() => {
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
    if (overlays.has('l3')) {
      const adj = [...new Set(data.filter(d => d.type === 'routing_adjacency').map(d => d.adj_type ?? ''))]
      if (adj.length) {
        other.push({ key: 'adj', style: OVERLAY_STYLE.routing,
          label: adj.map(a => ADJ_LABEL[a] ?? a.toUpperCase()).join(' · ') })
      }
    }
    const pairs = data.filter(d => d.type === 'bgp_pair')
    const procs = pairs.flatMap(d => d.bgp_processes ?? [])
    if (overlays.has('bgp')) {
      if (procs.some(p => p.type === 'ebgp')) other.push({ key: 'ebgp', style: OVERLAY_STYLE.ebgp, label: 'eBGP' })
      if (procs.some(p => p.type === 'ibgp')) other.push({ key: 'ibgp', style: OVERLAY_STYLE.ibgp, label: 'iBGP' })
      if (pairs.some(d => !(d.bgp_processes ?? []).some(p => p.type === 'ebgp' || p.type === 'ibgp'))) {
        other.push({ key: 'bgp', style: OVERLAY_STYLE.routing, label: t.legendBgpUntyped })
      }
    }
    // 役割が 2 つ以上あるときだけ絞り込みを出す（1 つなら外すと全部消えるだけ）
    const roles = [...new Set(procs.map(p => p.role).filter((r): r is string => !!r))]
    return { l1, other, bgpRoles: overlays.has('bgp') && roles.length >= 2 ? roles : [] }
  }, [edges, overlays, t])

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
          {bgpRoles.length > 0 && (
            <div className="legend-roles" data-tip={t.bgpRolesTip}>
              {bgpRoles.map(r => (
                <button key={r} type="button"
                  className={`legend-role${hiddenBgpRoles.has(r) ? ' is-off' : ''}`}
                  onClick={() => onToggleBgpRole(r)}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
})
