/**
 * cardSize.ts — 機器カードの高さの見積もり
 *
 * 配置 (layout) は、カードがいちばん高くなるとき（near 以上で全オーバーレイを出したとき）の高さで段の間隔と
 * VLAN の札の帯の位置を決める（札をカードに重ねない）。押して開くもの（IF の IP・VLAN の端点・検索ヒット）は含めない。
 * DeviceNode と flow.css の .device-card まわりを変えたら、ここも合わせる。
 */
import { roleStyle } from './palette'
import { isVlanIf, l3Name } from './l3'
import type { CyNodeData, NodeVtep, NodeBgpSession } from '../types/topology'

/** カードの中の幅（184 − 左右の余白 24 − 枠 2）*/
const INNER_W = 158
/** 上下の余白と枠、見出し（28）、バッジの 1 行目（margin 8 + 17.8）*/
const BASE_H = 77
/** DeviceNode の MAX_IF_CHIPS / MAX_SVI_CHIPS */
const MAX_CHIPS = 6

// 文字数からの幅（左右の余白 14 + 1 文字の幅）
const chip = (s: string) => 14 + s.length * 4.6    // IF チップ（8.5px 等幅）
const sviChip = (s: string) => 14 + s.length * 5.1 // SVI チップ（8.5px 等幅の太字）
const mono = (s: string) => 14 + s.length * 5.5    // VTEP・トポロジー外の相手（9px 等幅）
const asBadge = (s: string) => 14 + s.length * 6.3 // AS（9px 等幅の太字）
const badge = (s: string) => 14 + s.length * 7.3   // ロール・implementation・VRF（9px 太字）
const ipText = (s: string) => 14 + s.length * 6.3  // ホストのアドレス（10.5px 等幅）

/** 幅 widths のものを gap で折り返して並べたときの行数（幅を超えるものは中で折り返す）*/
function rowCount(widths: number[], gap: number): number {
  let rows = 0, x = Infinity
  widths.forEach(w => {
    if (w > INNER_W) { rows += Math.ceil(w / INNER_W); x = Infinity; return }
    if (x + gap + w > INNER_W) { rows++; x = w } else x += gap + w
  })
  return rows
}

/** 折り返して並ぶ区画の高さ（区画の上の margin を含む。空なら 0）*/
function block(widths: number[], rowH: number, gap: number, margin: number): number {
  const n = rowCount(widths, gap)
  return n ? margin + n * rowH + (n - 1) * gap : 0
}

/** chips を上限まで並べ、超えた分は …+n の札にする */
const capped = (names: string[], width: (s: string) => number) =>
  [...names.slice(0, MAX_CHIPS).map(width), ...(names.length > MAX_CHIPS ? [20] : [])]

export function cardHeight(nd: CyNodeData): number {
  const l3 = nd.l3_interfaces ?? []
  const badges = [badge(roleStyle(nd.role).label)]
  if (nd.implementation) badges.push(badge(nd.implementation))
  if (nd.local_as != null) badges.push(asBadge(`AS ${nd.local_as}`))

  const vteps = ((nd.vteps ?? []) as NodeVtep[]).map(v => mono(`VTEP ${v.address ?? v.address_v6 ?? v.source}`))
  const peers = ((nd.bgp_sessions ?? []) as NodeBgpSession[]).filter(s => !s.peer.node)
    .map(s => mono(`→ ${s.peer.address} AS${s.peer.local_as} · eBGP · ${s.address_families.join('+')}`))
  const own = l3.filter(e => e.ip)
  const net = [
    ...(own.length === 1 ? [ipText(own[0].ip)] : []),
    ...(nd.vrfs ?? []).filter(v => v !== 'vrf-default').map(v => badge(v.replace(/^vrf-/, ''))),
  ]
  const svis = l3.filter(isVlanIf).map(e => `vl${(e.attaches_to?.vlan ?? l3Name(e)).replace(/^vlan-/, '')}`)
  const ifs = l3.length ? l3.filter(e => !isVlanIf(e)).map(l3Name)
    : (nd.ips ?? []).map(s => s.slice(0, Math.max(s.indexOf(':'), 0)))

  return BASE_H
    + (rowCount(badges, 5) - 1) * (17.8 + 5)
    + block(vteps, 15.8, 4, 6)
    + block(peers, 16, 4, 6)
    + block(net, 18, 6, 7)
    + block(capped(svis, sviChip), 18, 4, 7)
    + block(capped(ifs, chip), 15, 4, 7)
}
