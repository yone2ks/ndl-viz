import type { ReactNode } from 'react'
import type { CyNodeData, CyEdgeData, TransportLink } from '../types/topology'
import { useT, type Messages } from '../i18n'
import { afShort, bgpTypeLabel, endLabel, transportParts } from '../flow/session'

interface Props {
  selected: { data: CyNodeData | CyEdgeData } | null
}

const TYPE_CLASS: Record<string, string> = {
  node: 'type-node',
  interface: 'type-interface',
  link: 'type-link',
  vlan: 'type-vlan',
  vrf: 'type-vrf',
  l3interface: 'type-l3interface',
  bgp_session: 'type-bgp_session',
  routing_neighbor: 'type-bgp_session',
  routing_adjacency: 'type-routing_adjacency',
  attaches_to: 'type-attaches_to',
}

const TYPE_LABEL: Record<string, string> = {
  node: 'Node',
  interface: 'Interface',
  link: 'Physical Link',
  attaches_to: 'Supporting',
  lag_member: 'LAG Member',
  mlag_peer: 'MLAG Peer',
  vlan: 'VLAN',
  l2vni: 'L2VNI',
  l3vni: 'L3VNI',
  vlan_member: 'VLAN Member',
  vrf: 'VRF',
  l3interface: 'L3 Interface',
  routing_adjacency: 'Routing Adj.',
  vrf_l3if: 'VRF ↔ IF',
  bgp_session: 'BGP Session',
  routing_neighbor: 'Session',
}

/** routing_neighbor の見出し: プロトコルの名前 */
const PROTOCOL_LABEL: Record<string, string> = { bgp: 'BGP', ospf: 'OSPF', isis: 'IS-IS' }

// offsetIndex 以下は ndl-viz が描画のために付けた値で、MLNDL の情報ではない
const SKIP_KEYS = new Set(['id',
  'offsetIndex', 'offsetCount', 'showLabel', 'detour', 'hue', 'pillW', 'crossing', 'crossingNodes'])

const KEY_LABEL: Record<string, string> = {
  source:    'node_a',
  target:    'node_b',
  source_if: 'interface_a',
  target_if: 'interface_b',
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 項目を区切り文字で並べる。各項目の中（vrf-tenant-a のハイフン等）では折り返さない */
const segs = (items: unknown[], sep: string) =>
  items.map((x, i) => <span key={i}>{i > 0 && sep}<span className="prop-seg">{String(x)}</span></span>)

/** 通り道 (transport_link): 種類と id。LAG とトンネルは両端の id を ↔ で結ぶ */
function transport(val: unknown): ReactNode {
  const tp = transportParts(val as TransportLink)
  if (!tp) return JSON.stringify(val)
  return <><code>{tp.kind}</code> {segs(tp.ids, ' ↔ ')}</>
}

/** オブジェクト 1 件を要約する。既知の形（L3 IF / VTEP）は 1 行目に名前とアドレス、2 行目に補足。ほかは key=value */
function summarize(t: Messages, key: string, o: Obj): ReactNode {
  if (key === 'l3_interfaces') {
    const addrs = [o.ip, o.ipv6].filter(Boolean).join(' ')
    // YAML でこの L3 IF に書かれていることだけを出す (attaches_to と vrf)。分類や役割など導いた値は出さない
    const at = isObj(o.attaches_to) ? Object.entries(o.attaches_to)[0] : undefined
    const notes = [at && `${at[0]}: ${String(at[1])}`, o.vrf].filter(Boolean)
    return <><code>{String(o.name)}</code> {addrs}
      {notes.length > 0 && <span className="prop-note">{segs(notes, ' · ')}</span>}</>
  }
  if (key === 'bgp_sessions') {
    // ノードの BGP セッション: 1 行目に相手・相手の AS・eBGP / iBGP・AF、2 行目にこの機器の端と VRF
    const peer = o.peer as Obj
    const afs = ((o.address_families as string[] | undefined) ?? []).map(afShort).join('+')
    const head = [peer.local_as != null && `AS${peer.local_as}`, bgpTypeLabel(o.bgp_type as string | undefined), afs].filter(Boolean)
    // 通り道は bridge・トンネルのときだけ添える (直結のリンクの id は線を見ればわかる)
    const tl = o.transport_link as TransportLink | undefined
    const via = tl?.bridge ?? tl?.tunnel?.[0]
    const notes = [endLabel(o.local as Obj, t.unnumbered), o.vrf, !peer.node && t.peerOutside,
      via && t.crossing(via)].filter(Boolean)
    return <><code>{String(o.id)}</code> → {String(peer.node ?? peer.address ?? '')} {segs(head, ' · ')}
      {notes.length > 0 && <span className="prop-note">{segs(notes, ' · ')}</span>}</>
  }
  if (key === 'bridges') {
    // 箱のポートで L2 を転送する bridge (ADR-0018 D1): 名前、2 行目にポート (L1 IF / LAG の id) と description
    // description は文なので、ポートの id と違って途中で折り返してよい
    const ports = ((o.ports as Obj[] | undefined) ?? []).map(p => p.interface ?? p.lag ?? p.ethernet_segment)
    return <><code>{String(o.id)}</code> {o.name ? String(o.name) : ''}
      {(ports.length > 0 || !!o.description) && <span className="prop-note">
        {segs(ports, ', ')}{ports.length > 0 && !!o.description && ' · '}{o.description ? String(o.description) : ''}
      </span>}</>
  }
  if (key === 'vteps') {
    const shared = Array.isArray(o.shared_with) ? ` · ${t.sharedWith(o.shared_with.join(', '))}` : ''
    return <><code>{String(o.id)}</code> {String(o.address ?? o.address_v6 ?? '')}
      <span className="prop-note">{String(o.source)}{shared}</span></>
  }
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

/** 値の表示。オブジェクトの配列は 1 件 1 行、オブジェクト（labels 等）は key: value を 1 行ずつ */
function renderValue(t: Messages, key: string, val: unknown): ReactNode {
  if (Array.isArray(val)) {
    if (!val.some(isObj)) return segs(val, ', ')
    return val.map((v, i) => (
      <div key={i} className="prop-item">{isObj(v) ? summarize(t, key, v) : String(v)}</div>
    ))
  }
  if (isObj(val) && key === 'transport_link') return transport(val)
  if (isObj(val) && (key === 'from' || key === 'to')) {
    // セッションの端: 機器・IF・アドレス・AS を 1 行に
    const notes = [val.route_reflector_client && 'route_reflector_client', val.l3_interface ?? val.interface].filter(Boolean)
    return <><code>{String(val.node ?? val.address ?? '')}</code> {endLabel(val, t.unnumbered)}
      {notes.length > 0 && <span className="prop-note">{segs(notes, ' · ')}</span>}</>
  }
  if (isObj(val)) {
    return Object.entries(val).map(([k, v]) => (
      <div key={k} className="prop-item">{k}: {isObj(v) ? JSON.stringify(v) : String(v)}</div>
    ))
  }
  return String(val)
}

export default function PropertiesPanel({ selected }: Props) {
  const t = useT()
  if (!selected) {
    return (
      <aside className="props-panel">
        <div className="panel-title">Properties</div>
        <div className="props-empty">{t.propsEmpty}</div>
      </aside>
    )
  }

  const data = selected.data
  const typeKey = data.type ?? 'default'
  const cls = TYPE_CLASS[typeKey] ?? 'type-default'
  const label = typeKey === 'routing_neighbor'
    ? PROTOCOL_LABEL[(data as CyEdgeData).protocol ?? ''] ?? TYPE_LABEL[typeKey]
    : TYPE_LABEL[typeKey] ?? typeKey

  // セッションは見出しでプロトコルを示し、両端は from / to で出す (source / target・type / layer は重複)
  const skip = (k: string) => SKIP_KEYS.has(k) || (typeKey === 'routing_neighbor'
    && ['type', 'layer', 'source', 'target', 'protocol'].includes(k))
  const entries = Object.entries(data).filter(
    ([k, v]) => !skip(k) && v !== undefined && v !== null && v !== ''
  )

  return (
    <aside className="props-panel">
      <div className="panel-title">Properties</div>
      <span className={`element-type ${cls}`}>{label}</span>

      <table className="props-table">
        <tbody>
          {entries.map(([key, val]) => (
            <tr key={key}>
              <td className="prop-key">{KEY_LABEL[key] ?? key}</td>
              <td className="prop-val">
                {renderValue(t, key, val)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  )
}
