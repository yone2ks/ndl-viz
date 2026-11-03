/**
 * session.ts — 制御プレーンのセッション (routing_neighbor 辺・ノードの bgp_sessions) の表示用の文言と見た目
 *
 * 値はすべて mlndl のエクスポーターが参照をたどって決めたもの (ADR-0010 D11)。ここでは推定しない。
 * underlay / overlay は出さない (BGP セッションの性質ではない。ADR-0010 D6)。運ぶ AF をそのまま出す。
 */
import { OVERLAY_STYLE, type LineStyle } from './palette'
import type { CyEdgeData, OverlayKey, SessionEndData, TransportLink } from '../types/topology'

/** 線をどの層のボタンで出すか。BGP は BGP、OSPF / IS-IS は Layer 3。attaches_to は常に出す。L1 リンクは null */
export function overlayOf(d: CyEdgeData): OverlayKey | 'always' | null {
  if (d.type === 'routing_neighbor') return d.protocol === 'bgp' ? 'bgp' : 'l3'
  if (d.type === 'vlan_member') return 'l2'
  if (d.type === 'attaches_to') return 'always'
  return null
}

/** BGP は凡例で外した AF だけを運ぶセッションを隠す (AF を書いていないセッションは絞らない) */
export function afsHidden(d: CyEdgeData, hiddenAfs: Set<string>): boolean {
  const afs = d.address_families ?? []
  return d.type === 'routing_neighbor' && d.protocol === 'bgp' && afs.length > 0 && afs.every(af => hiddenAfs.has(af))
}

/** address_families の値 (YAML) → 表示名 */
const AF_SHORT: Record<string, string> = {
  ipv4_unicast: 'ipv4', ipv6_unicast: 'ipv6', l2vpn_evpn: 'evpn', vpnv4: 'vpnv4', vpnv6: 'vpnv6',
}
export const afShort = (af: string): string => AF_SHORT[af] ?? af

const BGP_TYPE_LABEL: Record<string, string> = { ebgp: 'eBGP', ibgp: 'iBGP' }
export const bgpTypeLabel = (t?: string): string => (t ? BGP_TYPE_LABEL[t] ?? t : 'BGP')

/** 線の見た目。BGP は eBGP / iBGP、AS が決まらなければ BGP。OSPF / IS-IS は隣接の線 */
export function sessionStyle(d: CyEdgeData): LineStyle {
  if (d.protocol !== 'bgp') return OVERLAY_STYLE.routing
  return d.bgp_type === 'ebgp' ? OVERLAY_STYLE.ebgp : d.bgp_type === 'ibgp' ? OVERLAY_STYLE.ibgp : OVERLAY_STYLE.routing
}

/** 線の中央の札。BGP は「eBGP · ipv4+evpn」、OSPF は「OSPF 0.0.0.0」、IS-IS は「IS-IS level-2」 */
export function sessionLabel(d: CyEdgeData): string {
  if (d.protocol === 'ospf') return `OSPF ${d.area ?? ''}`.trim()
  if (d.protocol === 'isis') return `IS-IS ${d.level ?? ''}`.trim()
  const afs = (d.address_families ?? []).map(afShort).join('+')
  return afs ? `${bgpTypeLabel(d.bgp_type)} · ${afs}` : bgpTypeLabel(d.bgp_type)
}

/** 端の札。その端の AS と、セッションを張るアドレス (unnumbered なら IF の名前)。トポロジー外の相手はアドレスと AS */
export function endLabel(end: SessionEndData | undefined, unnumbered: string): string {
  if (!end) return ''
  const as = end.local_as != null ? `AS${end.local_as}` : ''
  const where = end.address
    ?? (end.unnumbered ? `${end.interface_name ?? ''} ${unnumbered}`.trim()
      : [end.ip, end.ipv6].filter(Boolean).join(' ') || end.interface_name || '')
  return [as, where].filter(Boolean).join(' · ')
}

/** トンネル IF の type (YAML) → 表示名 */
const TUNNEL_TYPE_LABEL: Record<string, string> = {
  gre: 'GRE', ipip: 'IPIP', ipsec_vti: 'IPsec VTI', wireguard: 'WireGuard',
}
export const tunnelTypeLabel = (t: string): string => TUNNEL_TYPE_LABEL[t] ?? t

/**
 * 通り道の種類と id。エクスポーターが参照をたどって決めたものをそのまま出す (ADR-0018 D5)。
 * LAG とトンネルは両端の id (from の側, to の側)
 */
export function transportParts(tl?: TransportLink): { kind: string; ids: string[] } | null {
  if (!tl) return null
  if (tl.link) return { kind: 'link', ids: [tl.link] }
  if (tl.lag) return { kind: 'lag', ids: tl.lag }
  if (tl.bridge) return { kind: 'bridge', ids: [tl.bridge] }
  if (tl.tunnel) return { kind: 'tunnel', ids: tl.tunnel }
  return null
}
