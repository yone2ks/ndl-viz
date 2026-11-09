import type { ReactNode } from 'react'
import type { CyNodeData, CyEdgeData, NodeLag, TransportLink } from '../types/topology'
import { useT, type Messages } from '../i18n'
import { afShort, bgpTypeLabel, endLabel, transportParts } from '../flow/session'

interface Props {
  selected: { data: CyNodeData | CyEdgeData } | null
  /** LAG の id → 機器の lags[] の 1 件。リンクの端の LAG の中身を出すのに使う */
  lagById?: Map<string, NodeLag>
}

const TYPE_CLASS: Record<string, string> = {
  node: 'type-node',
  interface: 'type-interface',
  link: 'type-link',
  vlan: 'type-vlan',
  vrf: 'type-vrf',
  l3interface: 'type-l3interface',
  routing_neighbor: 'type-bgp_session',
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
  vrf_l3if: 'VRF ↔ IF',
  routing_neighbor: 'Session',
}

/** routing_neighbor の見出し: プロトコルの名前 */
const PROTOCOL_LABEL: Record<string, string> = { bgp: 'BGP', ospf: 'OSPF', isis: 'IS-IS' }

// 見出しに id を出す種類: id が MLNDL に書かれたもの。attaches_to・vlan_member・lag_bundle の id はエクスポーターが作った値なので出さない
const OWN_ID_TYPES = new Set(['node', 'interface', 'link', 'vlan', 'l2vni', 'l3vni', 'vrf', 'l3interface',
  'routing_neighbor', 'ethernet_segment'])

// offsetIndex 以下は ndl-viz が描画のために付けた値で、MLNDL の情報ではない
const SKIP_KEYS = new Set(['id',
  'offsetIndex', 'offsetCount', 'showLabel', 'detour', 'hue', 'pillW', 'crossing', 'crossingNodes'])

// L1 リンクは無向 (ADR-0006)。source / target は endpoints の 1 番目と 2 番目なので、向きのない a / b で見せる
const KEY_LABEL: Record<string, string> = {
  source:     'node_a',
  target:     'node_b',
  source_if:  'interface_a',
  target_if:  'interface_b',
  source_lag: 'lag_a',
  target_lag: 'lag_b',
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

/**
 * 一覧の 1 件の補足。どの要素でも、先頭に項目名つきの id (YAML に戻る手がかり)、続けて項目名つきの値を ' · ' で並べる。
 * description は文なので、別の行に出す
 */
function notesOf(id: unknown, items: unknown[], description?: unknown): ReactNode {
  const all = [id != null && `id ${String(id)}`, ...items].filter(Boolean)
  return <>
    {all.length > 0 && <span className="prop-note">{segs(all, ' · ')}</span>}
    {!!description && <span className="prop-note">{String(description)}</span>}
  </>
}

/** LAG 1 件: 1 行目に機器上の名前 (なければ id) とメンバー、補足に id・LACP・ES、description */
function lagSummary(o: Obj): ReactNode {
  const lacp = isObj(o.lacp) ? o.lacp : undefined
  const items = [
    lacp?.mode && `LACP ${String(lacp.mode)}`,
    lacp?.min_links != null && `min_links ${String(lacp.min_links)}`,
    o.ethernet_segment && `ES ${String(o.ethernet_segment)}`,
  ]
  return <><code>{String(o.name ?? o.id)}</code> {segs((o.members as unknown[] | undefined) ?? [], ', ')}
    {notesOf(o.name ? o.id : undefined, items, o.description)}</>
}

/** オブジェクト 1 件を要約する。既知の形（L3 IF / VTEP）は 1 行目に名前とアドレス、2 行目に補足。ほかは key=value */
function summarize(t: Messages, key: string, o: Obj): ReactNode {
  if (key === 'lags') return lagSummary(o)
  if (key === 'l3_interfaces') {
    const addrs = [o.ip, o.ipv6].filter(Boolean).join(' ')
    // YAML でこの L3 IF に書かれていることだけを出す (attaches_to と vrf)。分類や役割など導いた値は出さない
    const at = isObj(o.attaches_to) ? Object.entries(o.attaches_to)[0] : undefined
    return <><code>{String(o.name ?? o.id)}</code> {addrs}
      {notesOf(o.name ? o.id : undefined, [at && `${at[0]}: ${String(at[1])}`, o.vrf && `vrf ${String(o.vrf)}`])}</>
  }
  if (key === 'bgp_sessions') {
    // ノードの BGP セッション: セッションは name を持たないので、1 行目は相手・相手の AS・eBGP / iBGP・AF。
    // 補足に id、この機器の端と VRF
    const peer = o.peer as Obj
    const afs = ((o.address_families as string[] | undefined) ?? []).map(afShort).join('+')
    const head = [peer.local_as != null && `AS${peer.local_as}`, bgpTypeLabel(o.bgp_type as string | undefined), afs].filter(Boolean)
    // 通り道は bridge・トンネルのときだけ添える (直結のリンクの id は線を見ればわかる)
    const tl = o.transport_link as TransportLink | undefined
    const via = tl?.bridge ?? tl?.tunnel?.[0]
    const items = [endLabel(o.local as Obj, t.unnumbered), o.vrf && `vrf ${String(o.vrf)}`, !peer.node && t.peerOutside,
      via && t.crossing(via)]
    return <>→ <code>{String(peer.node ?? peer.address ?? '')}</code> {segs(head, ' · ')}
      {notesOf(o.id, items)}</>
  }
  if (key === 'bridges') {
    // 箱のポートで L2 を転送する bridge (ADR-0018 D1): 名前 (なければ id)、補足に id とポート (L1 IF / LAG / ES の id)
    const ports = ((o.ports as Obj[] | undefined) ?? []).map(p => `ports ${String(p.interface ?? p.lag ?? p.ethernet_segment)}`)
    return <><code>{String(o.name ?? o.id)}</code>
      {notesOf(o.name ? o.id : undefined, ports, o.description)}</>
  }
  if (key === 'vteps') {
    // VTEP は name を持たない。ネットワークの中で VTEP を表すのはアドレスなので、1 行目はアドレス (なければ id)
    const addr = o.address ?? o.address_v6
    const items = [o.source && `source ${String(o.source)}`,
      Array.isArray(o.shared_with) && t.sharedWith(o.shared_with.join(', '))]
    return <><code>{String(addr ?? o.id)}</code>
      {notesOf(addr ? o.id : undefined, items, o.description)}</>
  }
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

/** 値の表示。オブジェクトの配列は 1 件 1 行、オブジェクト（labels 等）は key: value を 1 行ずつ */
function renderValue(t: Messages, key: string, val: unknown, lagById?: Map<string, NodeLag>): ReactNode {
  // リンクの端の LAG: 機器の lags[] から中身を引く。引けなければ id だけ
  if ((key === 'source_lag' || key === 'target_lag') && typeof val === 'string') {
    const lag = lagById?.get(val)
    return lag ? lagSummary(lag as unknown as Obj) : val
  }
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

export default function PropertiesPanel({ selected, lagById }: Props) {
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
  // リンクは端ごとの LAG (lag_a / lag_b) を出すので、片方の端しか持たない lag_id は出さない
  const skip = (k: string) => SKIP_KEYS.has(k) || (typeKey === 'routing_neighbor'
    && ['type', 'layer', 'source', 'target', 'protocol'].includes(k))
    || (typeKey === 'link' && k === 'lag_id')
  const entries = Object.entries(data).filter(
    ([k, v]) => !skip(k) && v !== undefined && v !== null && v !== ''
  )

  return (
    <aside className="props-panel">
      <div className="panel-title">Properties</div>
      <div className="element-head">
        <span className={`element-type ${cls}`}>{label}</span>
        {OWN_ID_TYPES.has(typeKey) && data.id && <code className="element-id">{String(data.id)}</code>}
      </div>

      <table className="props-table">
        <tbody>
          {entries.map(([key, val]) => (
            <tr key={key}>
              <td className="prop-key">{KEY_LABEL[key] ?? key}</td>
              <td className="prop-val">
                {renderValue(t, key, val, lagById)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  )
}
