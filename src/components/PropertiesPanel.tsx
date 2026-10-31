import type { ReactNode } from 'react'
import type { CyNodeData, CyEdgeData } from '../types/topology'
import { useT, type Messages } from '../i18n'

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
  bgp_pair: 'type-bgp_session',
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
  bgp_pair: 'BGP',
}

// lo_ip / lo_ipv6 は mlndl が選んだ代表アドレスで、MLNDL に書かれた情報ではないので出さない
const SKIP_KEYS = new Set(['id', 'lo_ip', 'lo_ipv6'])

const KEY_LABEL: Record<string, string> = {
  source:    'node_a',
  target:    'node_b',
  source_if: 'interface_a',
  target_if: 'interface_b',
  // BGP の組: どこに書かれた情報かを示す
  bgp_processes:       'protocols.bgp',
  routing_adjacencies: 'routing_adjacencies',
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 項目を区切り文字で並べる。各項目の中（vrf-tenant-a のハイフン等）では折り返さない */
const segs = (items: unknown[], sep: string) =>
  items.map((x, i) => <span key={i}>{i > 0 && sep}<span className="prop-seg">{String(x)}</span></span>)

/** オブジェクト 1 件を要約する。既知の形（L3 IF / VTEP）は 1 行目に名前とアドレス、2 行目に補足。ほかは key=value */
function summarize(t: Messages, key: string, o: Obj): ReactNode {
  if (key === 'l3_interfaces') {
    const addrs = [o.ip, o.ipv6].filter(Boolean).join(' ')
    // YAML でこの L3 IF に書かれていることだけを出す (attaches_to と vrf)。分類や役割など導いた値は出さない。
    // 旧 JSON は attaches_to の代わりに vlan / subinterface / lag の別キーを持つ
    const at = isObj(o.attaches_to) ? Object.entries(o.attaches_to)[0]
      : (['vlan', 'subinterface', 'lag'] as const).map(k => [k, o[k]] as const).find(([, v]) => v)
    const notes = [at && `${at[0]}: ${String(at[1])}`, o.vrf].filter(Boolean)
    return <><code>{String(o.name ?? o.interface)}</code> {addrs}
      {notes.length > 0 && <span className="prop-note">{segs(notes, ' · ')}</span>}</>
  }
  if (key === 'bgp_processes') {
    // 1 行目: プロセス名・役割・eBGP / iBGP・両側の AS。2 行目: アドレスファミリー・BFD・片側だけの記述
    const types: Record<string, string> = { ebgp: 'eBGP', ibgp: 'iBGP' }
    const head = [o.role, o.type && (types[String(o.type)] ?? o.type)].filter(Boolean)
    const as = Object.entries(o.as as Record<string, number>).map(([n, a]) => `${n} AS${a}`)
    const declared = o.declared_by as string[]
    const notes = [...((o.address_families as string[] | undefined) ?? []), o.bfd && 'BFD',
      declared.length === 1 && t.onlyDeclaredBy(declared[0])].filter(Boolean)
    return <><code>{String(o.process)}</code> {segs(head, ' · ')}
      <div>{segs(as, ' ↔ ')}</div>
      {notes.length > 0 && <span className="prop-note">{segs(notes, ' · ')}</span>}</>
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
  const label = TYPE_LABEL[typeKey] ?? typeKey

  // BGP の組は ndl-viz がまとめたもので、type / layer は MLNDL に書かれた値ではないので出さない（種別は見出しで示す）
  const skip = (k: string) => SKIP_KEYS.has(k) || (typeKey === 'bgp_pair' && (k === 'type' || k === 'layer'))
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
