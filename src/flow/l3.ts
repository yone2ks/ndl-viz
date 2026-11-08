/**
 * l3 — L3 IF の読み方（mlndl exporter の出力。docs/exporter-cytoscape.md）
 *
 * 分類は attachment（attaches_to のキーから決まる。ADR-0011 D11）で読み、名前では判定しない。
 * 旧キー（interface / kind / vlan、ノードの lo_ip）は mlndl ADR-0025 でなくなったので読まない。
 */
import type { CyNodeData, L3IfEntry } from '../types/topology'

/** 機器上の名前 */
export const l3Name = (e: L3IfEntry): string => e.name

/** VLAN の上に載る L3 IF（SVI / IRB）か */
export const isVlanIf = (e: L3IfEntry): boolean => e.attachment === 'vlan'

/**
 * L3 IF が 1 つだけのノードの、そのアドレス（IPv4、なければ IPv6）。2 つ以上なら出さない。
 * MLNDL はノードの代表アドレスを定義しないので、どれか 1 つを選ぶことはしない (ADR-0011 D11)
 */
export const soleAddress = (nd: CyNodeData): string | undefined => {
  const own = (nd.l3_interfaces ?? []).filter(e => e.ip || e.ipv6)
  return own.length === 1 ? (own[0].ip || own[0].ipv6) : undefined
}
