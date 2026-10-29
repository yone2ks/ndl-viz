/**
 * l3 — L3 IF の読み方（mlndl exporter の出力。docs/exporter-cytoscape.md）
 *
 * 分類は attachment（attaches_to のキーから決まる。ADR-0011 D11）で読み、名前では判定しない。
 * 新キーのない古い JSON は旧キー（interface / kind）で読む。
 */
import type { L3IfEntry } from '../types/topology'

/** 機器上の名前（新キー name、旧キー interface）*/
export const l3Name = (e: L3IfEntry): string => e.name ?? e.interface

/** VLAN の上に載る L3 IF（SVI / IRB）か */
export const isVlanIf = (e: L3IfEntry): boolean =>
  e.attachment ? e.attachment === 'vlan' : e.kind === 'svi'
