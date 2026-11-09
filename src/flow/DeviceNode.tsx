/**
 * DeviceNode — ネットワーク機器の HTML カードノード
 *
 * グラスモーフィズムカード: role 色のアクセント、ステータスドット、
 * LOD に応じて AS / VRF チップを出し分ける。ノードの代表アドレスは出さない
 * （どれが代表かは MLNDL に書かれていない。IP は IF チップで見る）。
 * near 以上では L3 IF の名前をチップで並べ、押した IF の IP を開く。
 * カードの中の要素にはツールチップを付けない（カードの下の要素に重なって邪魔になる）。
 */

/** カードに並べる IF チップの上限（超えた分は …+n にまとめ、ツールチップに名前を出す）*/
const MAX_IF_CHIPS = 6
/** SVI（vl）チップの上限。選択中の VLAN のチップは上限を超えていても出す */
const MAX_SVI_CHIPS = 6
/** 雲に並べる bridge の上限（雲の大きさは固定。超えた分は …+n。全部はプロパティで見る）*/
const MAX_CLOUD_BRIDGES = 2
import { memo, useState } from 'react'
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react'
import { roleStyle, vrfColor, PROVIDER_NETWORK } from './palette'
import { Glyph } from './Glyph'
import { useFlowCtx, lodOf, type Lod } from './FlowCtx'
import { useT } from '../i18n'
import type { CyNodeData, NodeVtep, NodeBgpSession } from '../types/topology'
import type { VlanEndpoint } from './layout'
import { l3Name, isVlanIf } from './l3'
import { afShort, bgpTypeLabel } from './session'

const lodSelector = (s: { transform: [number, number, number] }): Lod => lodOf(s.transform[2])

/** 事業者網の雲の輪郭（184 × 104。cardSize の CLOUD_H と同じ大きさ）*/
const CLOUD_PATH = 'M46,96 C22,96 6,82 10,64 C0,52 8,30 30,32 C32,14 56,4 76,14 C88,2 116,0 128,16 '
  + 'C146,6 172,16 170,38 C184,46 184,74 170,82 C166,92 156,96 146,96 Z'

export const DeviceNode = memo(function DeviceNode({ id, data, selected }: NodeProps) {
  const nd = data as unknown as CyNodeData
  const rs = roleStyle(nd.role)
  const lod = useStore(lodSelector)
  const t = useT()
  const { overlays, hoveredId, setHoveredId, adjacency, ifIp, vlanHue, setFocusVlanId, focusVlanId,
    query, matchedIds, vniFocusNodes, vlanEndpoints, bundle } = useFlowCtx()

  const searchActive = query !== ''
  const matched = matchedIds.has(id)
  // 検索中は非マッチを減光（ホバー fog より優先）。非検索時は従来のホバー fog
  // VNI フォーカス中は、その VNI の VTEP を終端しないノードを減光
  // LAG / Ethernet Segment の組にフォーカス中は、組のリンクの端の機器だけを残す
  const dim = searchActive
    ? !matched
    : bundle
      ? !bundle.nodes.has(id)
    : vniFocusNodes
      ? !vniFocusNodes.has(id)
      : hoveredId !== null && hoveredId !== id && !adjacency.get(hoveredId)?.has(id)
  // 終端する VTEP（L2 overlay ON 時。ADR-0014）
  const vteps = overlays.has('l2') && lod !== 'far' ? (nd.vteps ?? []) as NodeVtep[] : []
  // クエリにマッチした l3_interface（IP 検索の該当 IF を強調表示）
  const hitIfs = searchActive && matched
    ? (nd.l3_interfaces ?? []).filter(e =>
        (e.ip + ' ' + l3Name(e)).toLowerCase().includes(query.toLowerCase()))
    : []
  // L3 IF が 1 つだけの端末（ホスト等）は、そのアドレスをオーバーレイによらず出す
  const ownIfs = (nd.l3_interfaces ?? []).filter(e => e.ip)
  const hostIp = ownIfs.length === 1 && lod !== 'far' ? ownIfs[0].ip : undefined
  // 選択中の VLAN の端点なら、その IF と IP をカードに出す（hostIp はそちらに任せる。ADR-0013 D7）
  const endpoints = groupEndpoints(focusVlanId ? vlanEndpoints.get(focusVlanId)?.get(id) ?? [] : [])
  const showHostIp = !!hostIp && !endpoints.some(g => g.ip)
  const showAs  = lod !== 'far' && overlays.has('bgp') && nd.local_as
  // トポロジー外の相手との BGP セッションは線にならないので、カードに出す (ADR-0010 D11。トンネルの destination_ip と同じ)
  const outsidePeers = lod !== 'far' && overlays.has('bgp')
    ? ((nd.bgp_sessions ?? []) as NodeBgpSession[]).filter(s => !s.peer.node) : []
  const showVrf = (lod === 'near' || lod === 'detail') && overlays.has('l3')
  const vrfs = showVrf ? (nd.vrfs ?? []).filter(v => v !== 'vrf-default') : []
  // near 以上: IF チップ（YAML に書かれた順）
  // SVI は下の vl チップで出すので除く
  const ifRows: { key: string; ifName: string; ip: string; ipv6?: string }[] =
    nd.l3_interfaces?.filter(e => !isVlanIf(e))
      .map(e => ({ key: e.id, ifName: l3Name(e), ip: e.ip, ipv6: e.ipv6 })) ?? []
  const showIfs = (lod === 'near' || lod === 'detail') && ifRows.length > 0
  const [openIfs, setOpenIfs] = useState<Set<string>>(() => new Set())
  const toggleIf = (key: string) => setOpenIfs(prev => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  })

  // SVI (VLAN IF): この機器が持つ VLAN IF を機器カードに表示
  //   通常: L2+L3 overlay ON かつ near 以上で全 SVI タグ
  //   VLAN フォーカス中: その VLAN の SVI は LOD/トグルに関係なく IP 付きで表示
  const sviEntries = [...(ifIp.get(id)?.entries() ?? [])].filter(([ifName]) => vlanHue.has(ifName))
  const sviZoomOk = overlays.has('l2') && overlays.has('l3') && (lod === 'near' || lod === 'detail')
  const svis = sviZoomOk
    ? sviEntries
    : focusVlanId
      ? sviEntries.filter(([v]) => v === focusVlanId)
      : []
  const shownSvis = svis.filter(([v], i) => i < MAX_SVI_CHIPS || v === focusVlanId)

  // 事業者網の箱は雲で描く。中の機器は書かれない (ADR-0017 D3) ので、名前と種類と、
  // 箱のポートで L2 を転送する bridge (ADR-0018 D1) だけを出す。bridge のない箱は L2 で透過しない
  if (nd.role === PROVIDER_NETWORK) {
    const bridges = lod !== 'far' ? nd.bridges ?? [] : []
    return (
      <div
        className={`cloud-card${dim ? ' is-dim' : ''}${selected ? ' is-selected' : ''}${searchActive && matched ? ' is-hit' : ''}`}
        style={{ '--accent': rs.accent } as React.CSSProperties}
        onMouseEnter={() => setHoveredId(id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        <Handle type="target" position={Position.Top} className="hidden-handle" />
        <Handle type="source" position={Position.Bottom} className="hidden-handle" />
        <svg className="cloud-shape" viewBox="0 0 184 104" aria-hidden="true"><path d={CLOUD_PATH} /></svg>
        <span className="cloud-name">{nd.label}</span>
        <span className="cloud-kind">{rs.label}</span>
        {bridges.slice(0, MAX_CLOUD_BRIDGES).map(b => (
          <span key={b.id} className="cloud-bridge">⇄ {b.name ?? b.id}</span>
        ))}
        {bridges.length > MAX_CLOUD_BRIDGES && <span className="cloud-bridge">…+{bridges.length - MAX_CLOUD_BRIDGES}</span>}
      </div>
    )
  }

  return (
    <div
      className={`device-card${dim ? ' is-dim' : ''}${selected ? ' is-selected' : ''}${searchActive && matched ? ' is-hit' : ''}`}
      style={{ '--accent': rs.accent } as React.CSSProperties}
      onMouseEnter={() => setHoveredId(id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <Handle type="target" position={Position.Top} className="hidden-handle" />
      <Handle type="source" position={Position.Bottom} className="hidden-handle" />

      <div className="card-head">
        <span className="card-icon"><Glyph kind={rs.glyph} size={17} /></span>
        <span className="card-name">{nd.label}</span>
        <span className="card-status" />
      </div>

      <div className="card-badges">
        <span className="badge badge-role">{rs.label}</span>
        {nd.implementation && (
          <span className="badge badge-impl">{nd.implementation}</span>
        )}
        {showAs && <span className="badge badge-as">AS {nd.local_as}</span>}
      </div>

      {vteps.length > 0 && (
        <div className="card-vteps">
          {vteps.map(v => (
            <span key={v.id} className={`badge badge-vtep${vniFocusNodes?.has(id) ? ' is-focused' : ''}`}>
              VTEP {(v.address ?? v.address_v6 ?? v.source).replace(/\/(32|128)$/, '')}
            </span>
          ))}
        </div>
      )}

      {focusVlanId && endpoints.map(g => {
        return (
          <div key={g.key} className={`card-vlan-endpoint is-${g.resolution}`}
            style={{ '--vh': vlanHue.get(focusVlanId) ?? 40 } as React.CSSProperties}>
            {/* ホストの IF は VLAN を設定しているわけではない (VLAN のポートはスイッチ側。ADR-0013 D7) ので、
                VLAN 番号は出さず、枠の色で VLAN との対応を、枠線の種類で確かさ（推定は破線）を示す */}
            <code>{g.name ?? g.interfaceNames.join(', ')}</code>
            {g.ip && <span className="vlan-ep-ip">{g.ip}</span>}
            {g.ipv6 && <span className="vlan-ep-ip">{g.ipv6}</span>}
            {g.resolution === 'ambiguous' && <span className="vlan-ep-note">{t.candidatesShort(g.candidates?.length ?? 0)}</span>}
            {g.outside_svi_subnet && <span className="vlan-ep-note">{t.outsideSubnet}</span>}
          </div>
        )
      })}

      {outsidePeers.length > 0 && (
        <div className="card-peers">
          {outsidePeers.map(s => (
            <span key={s.id} className="badge badge-peer">
              → {s.peer.address} AS{s.peer.local_as} · {bgpTypeLabel(s.bgp_type)}
              {s.address_families.length > 0 && ` · ${s.address_families.map(afShort).join('+')}`}
            </span>
          ))}
        </div>
      )}

      {/* 検索ヒット: 該当 IF / IP を強調表示（IP 検索の答えをカードに出す）*/}
      {hitIfs.length > 0 && (
        <div className="card-hits">
          {hitIfs.slice(0, 4).map(e => (
            <div key={l3Name(e)} className="hit-row">
              <span className="hit-if">{l3Name(e)}</span>
              <span className="hit-ip">{e.ip}</span>
            </div>
          ))}
        </div>
      )}

      {(showHostIp || vrfs.length > 0) && (
        <div className="card-net">
          {showHostIp && <span className="ip-mono">{hostIp}</span>}
          {vrfs.map(v => (
            <span key={v} className="badge badge-vrf"
              style={{ '--vrf': vrfColor(v) } as React.CSSProperties}>
              {v.replace(/^vrf-/, '')}
            </span>
          ))}
        </div>
      )}

      {/* SVI チップ: この機器が持つ VLAN IF（クリックで該当 VLAN にフォーカス）。
          IP はフォーカス時にレール端点へ表示するため、ここでは VLAN タグのみ */}
      {svis.length > 0 && (
        <div className="card-svis">
          {/* 並びは固定（選んだチップを先頭に動かすと、押した場所からチップが逃げる）*/}
          {shownSvis.map(([vlanId, ip]) => {
              const hue = vlanHue.get(vlanId)!
              const num = vlanId.replace(/^vlan-/, '')
              const focused = focusVlanId === vlanId
              return (
                <button key={vlanId} type="button"
                  className={`svi-chip${focused ? ' is-focused' : ''}`}
                  style={{ '--vh': hue } as React.CSSProperties}
                  onClick={e => {
                    e.stopPropagation()
                    setFocusVlanId(focused ? null : vlanId)
                  }}>
                  <span className="svi-vlan">vl{num}</span>
                  {focused && <span className="svi-ip">{ip}</span>}
                </button>
              )
            })}
          {svis.length > shownSvis.length && <span className="ip-more">…+{svis.length - shownSvis.length}</span>}
        </div>
      )}

      {/* IF チップ: 押すとその IF の IP を開く（もう一度押すと閉じる）*/}
      {showIfs && (
        <div className="card-ifs">
          {ifRows.slice(0, MAX_IF_CHIPS).map(r => {
            const open = openIfs.has(r.key)
            return (
              <button key={r.key} type="button"
                className={`if-chip nodrag${open ? ' is-open' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  toggleIf(r.key)
                }}>
                <span className="if-name">{r.ifName}</span>
                {open && <span className="if-ip">{r.ip}</span>}
                {open && r.ipv6 && <span className="if-ip">{r.ipv6}</span>}
              </button>
            )
          })}
          {ifRows.length > MAX_IF_CHIPS && (
            <span className="ip-more">
              …+{ifRows.length - MAX_IF_CHIPS}
            </span>
          )}
        </div>
      )}
    </div>
  )
})

/** 同じ L3 IF（または bond）に届く端点を 1 行にまとめる。MLAG の両脚は via が 2 つになる */
function groupEndpoints(eps: VlanEndpoint[]) {
  const groups = new Map<string, Omit<VlanEndpoint, 'via'> & { key: string; via: string[]; interfaceNames: string[] }>()
  eps.forEach(ep => {
    const key = ep.l3_interface ?? ep.lag ?? ep.interfaces.join(',')
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { ...ep, key, via: [ep.via], interfaceNames: [...ep.interface_names] })
      return
    }
    if (!g.via.includes(ep.via)) g.via.push(ep.via)
    ep.interface_names.forEach(n => { if (!g.interfaceNames.includes(n)) g.interfaceNames.push(n) })
  })
  return [...groups.values()]
}
