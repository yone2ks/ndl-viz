/** 機器ノードの L3 IF（mlndl exporter。docs/exporter-cytoscape.md）*/
export interface L3IfEntry {
  id?: string
  name?: string               // 機器上の名前（参照ではない）
  /** 何の上に載るか。attaches_to のキーから決まる（ADR-0011 D11）。unattached はループバックとは限らない */
  attachment?: 'l1_interface' | 'lag' | 'vlan' | 'subinterface' | 'unattached'
  attaches_to?: Record<string, string>   // YAML と同じ形（{interface: <L1 IF の id>} 等）
  roles?: ('update_source' | 'vtep_source')[]
  ip: string
  ipv6?: string
  vrf?: string
  /** 旧キー（ndl_version 1.x の間だけ）: interface は name と同じ、kind は attachment から写したもの */
  interface: string
  kind: 'loopback' | 'svi' | 'subinterface' | 'routed'
  vlan?: string               // 旧キー: SVI の VLAN ノード id
}

/** 機器ノードが終端する VTEP（mlndl exporter。ADR-0014）*/
export interface NodeVtep {
  id: string
  source: string          // 終端する L3 IF の機器上の名前（loopback1 等）
  address?: string
  address_v6?: string
  shared_with?: string[]  // 共有 VTEP の相手ノード（MLAG ペア等）
}

export interface CyNodeData {
  id: string
  label: string
  layer: 'layer1' | 'layer2' | 'layer3'
  type: 'node' | 'vlan' | 'l2vni' | 'l3vni'
  role?: string
  implementation?: string
  device_type?: string
  vlan_id?: number
  vni?: number
  // L3 埋め込みデータ
  lo_ip?: string     // 旧キー: exporter が選んだ代表アドレス。カードには出さない（検索の対象にだけ入れる）
  /** 構造化 L3 IF 一覧（mlndl exporter 新形式）*/
  l3_interfaces?: L3IfEntry[]
  /** 旧形式 "ifname:ip" 文字列配列（後方互換フォールバック）*/
  ips?: string[]
  vrfs?: string[]
  // L2 埋め込みデータ
  vlans?: string[]
  // VLAN node 専用（type=vlan の場合）
  subnet?: string    // "192.168.100.0/24"
  gateway?: string   // "192.168.100.254" (anycast VIP / VRRP VIP)
  vrf_name?: string  // VRF 名
  // VNI node 専用（type=l2vni / l3vni の場合）
  vlan?: string      // l2vni: 紐づく VLAN ノード id
  vrf?: string       // l3vni: 紐づく VRF 名
  /** type=node: 終端する VTEP / type=l2vni・l3vni: 載る VTEP の id（l3vni は VRF から導出）*/
  vteps?: NodeVtep[] | string[]
  // BGP 埋め込みデータ
  local_as?: number
}

/** VLAN の端点（mlndl exporter が参照をたどって導出。ADR-0013 D7）*/
export interface VlanEndpointData {
  node: string
  interfaces: string[]        // 端点の L1 IF の id
  interface_names: string[]
  tagged: boolean
  /** direct: 参照で確定 / tag_match: タグの一致から推定 / ambiguous: 候補が複数 / no_l3: L3 IF なし */
  resolution: 'direct' | 'tag_match' | 'ambiguous' | 'no_l3'
  lag?: string
  l3_interface?: string
  name?: string               // L3 IF の機器上の名前
  ip?: string
  ipv6?: string
  candidates?: { l3_interface: string; name: string; ip?: string; ipv6?: string }[]
  outside_svi_subnet?: string[]
}

export interface CyEdgeData {
  id: string
  source: string
  target: string
  layer: string
  type: 'link' | 'attaches_to' | 'vlan_member' | 'routing_adjacency' | 'bgp_session'
  // L1
  link_speed?: string
  mtu?: number
  link_role?: string
  source_if?: string
  target_if?: string
  lag_id?: string
  lag_type?: string
  // L2 VLAN メンバー: trunk(tagged) / access(untagged) で区別
  vlan_id?: number
  tagged_on?: string[]
  untagged_on?: string[]
  /** 旧形式（後方互換フォールバック）*/
  interfaces?: string[]
  /** このノードの VLAN のポートの対向にいる VLAN の端点 */
  endpoints?: VlanEndpointData[]
  // L3
  adj_type?: string
  // BGP
  bgp_type?: string
  label?: string
  local_as?: number
  remote_as?: number
  process?: string
  process_role?: string
  bfd?: boolean
  address_families?: string[]
}

export interface CyElement {
  data: CyNodeData | CyEdgeData
}

export interface TopologyData {
  nodes: CyElement[]
  edges: CyElement[]
}

// L1 は常時表示、L2/L3/BGP はオーバーレイとしてトグル
export type OverlayKey = 'l2' | 'l3' | 'bgp'
