/**
 * l3 — L3 IF の読み方（mlndl exporter の出力。docs/exporter-cytoscape.md）
 *
 * 分類は attachment（attaches_to のキーから決まる。ADR-0011 D11）で読み、名前では判定しない。
 * 旧キー（interface / kind / vlan、ノードの lo_ip）は mlndl ADR-0025 でなくなったので読まない。
 */
import type { L3IfEntry } from '../types/topology'

/** 機器上の名前 */
export const l3Name = (e: L3IfEntry): string => e.name

/** VLAN の上に載る L3 IF（SVI / IRB）か */
export const isVlanIf = (e: L3IfEntry): boolean => e.attachment === 'vlan'
