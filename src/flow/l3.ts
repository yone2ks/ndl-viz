/**
 * l3 — L3 IF の読み方（mlndl exporter の出力。docs/exporter-cytoscape.md）
 *
 * 分類は attachment（attaches_to のキーから決まる。ADR-0011 D11）で読み、名前では判定しない。
 * 新キーのない古い JSON は旧キー（interface / kind / lo_ip）で読む。
 */
import type { CyNodeData, L3IfEntry } from '../types/topology'

/** 機器上の名前（新キー name、旧キー interface）*/
export const l3Name = (e: L3IfEntry): string => e.name ?? e.interface

/** VLAN の上に載る L3 IF（SVI / IRB）か */
export const isVlanIf = (e: L3IfEntry): boolean =>
  e.attachment ? e.attachment === 'vlan' : e.kind === 'svi'

/**
 * ノードの代表アドレス（カードに 1 つだけ出すもの）。docs/exporter-cytoscape.md の推奨手順:
 * unattached の L3 IF のうち update_source に使われているもの → VTEP の source ではないもの → 先に書かれたもの
 */
export function primaryAddress(nd: CyNodeData): string | undefined {
  const ifs = nd.l3_interfaces ?? []
  if (!ifs.some(e => e.attachment)) return nd.lo_ip
  const cands = ifs.filter(e => e.attachment === 'unattached' && e.ip)
  const pick = cands.find(e => e.roles?.includes('update_source'))
    ?? cands.find(e => !e.roles?.includes('vtep_source'))
    ?? cands[0]
  return pick?.ip
}
