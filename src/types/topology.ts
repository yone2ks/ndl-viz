/** 機器ノードの L3 IF（mlndl exporter。docs/exporter-cytoscape.md）*/
export interface L3IfEntry {
  id: string
  name: string                // 機器上の名前（参照ではない）
  /** 何の上に載るか。attaches_to のキーから決まる（ADR-0011 D11）。unattached はループバックとは限らない */
  attachment: 'l1_interface' | 'lag' | 'vlan' | 'subinterface' | 'unattached'
  attaches_to?: Record<string, string>   // YAML と同じ形（{interface: <L1 IF の id>} 等）
  roles?: ('update_source' | 'vtep_source')[]
  ip: string
  ipv6?: string
  vrf?: string
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
  type: 'node' | 'vlan' | 'l2vni' | 'l3vni' | 'bridge' | 'ethernet_segment'
  role?: string
  implementation?: string
  description?: string    // 人が読む補足。YAML に書かれたまま (ADR-0011 D7)
  /** 多軸の分類 (ADR-0009)。サイトは labels.site (ADR-0017 D1) */
  labels?: Record<string, string>
  device_type?: string
  vlan_id?: number
  vni?: number
  // L3 埋め込みデータ。ノードの代表アドレスは MLNDL にないので受け取らない (mlndl ADR-0011 D11・ADR-0025 D3)
  /** L3 IF 一覧（mlndl exporter。docs/exporter-cytoscape.md）*/
  l3_interfaces?: L3IfEntry[]
  vrfs?: string[]
  // L2 埋め込みデータ
  vlans?: string[]
  // VLAN node 専用（type=vlan の場合）
  subnet?: string    // "192.168.100.0/24"
  subnet_v6?: string // "2001:db8:100::/64"
  gateway?: string   // "192.168.100.254" (anycast VIP / VRRP VIP)
  vrf_name?: string  // VRF 名
  // VNI node 専用（type=l2vni / l3vni の場合）
  vlan?: string      // l2vni: 紐づく VLAN ノード id
  vrf?: string       // l3vni: 紐づく VRF 名
  /** type=node: 終端する VTEP / type=l2vni・l3vni: 載る VTEP の id（l3vni は VRF から導出）*/
  vteps?: NodeVtep[] | string[]
  /** type=node: この機器のトンネル IF (ADR-0011 D6) */
  tunnels?: NodeTunnel[]
  /** type=node: この機器の BGP セッションすべて (相手がトポロジー外のものを含む。ADR-0010 D11) */
  bgp_sessions?: NodeBgpSession[]
  // BGP 埋め込みデータ
  local_as?: number
  /** type=bridge: 転送するポート (ADR-0018 D1) と、ポートを持つ機器 */
  ports?: BridgePortData[]
  /** type=bridge: ポートを持つ機器。type=ethernet_segment: 脚の機器 (mlndl ADR-0023) */
  nodes?: string[]
  /** type=ethernet_segment: 脚 ({lag:} か {interface:}) と、その機器 */
  members?: SegmentMemberData[]
  /** type=ethernet_segment: 書かれていれば all_active / single_active。書かれていなければない (既定値で埋めない) */
  redundancy_mode?: string
  name?: string
  /** type=node: この機器のポートで転送する bridge。ndl-viz が type=bridge の要素から集めて載せる */
  bridges?: NodeBridge[]
}

/** 機器ノードのトンネル IF。destination はどちらか一方 */
export interface NodeTunnel {
  id: string
  type: string            // gre / ipip / ipsec_vti / wireguard
  source: string
  destination_interface?: string
  destination_ip?: string
  ip?: string
  ipv6?: string
  vrf?: string
  description?: string
}

/** bridge のポート。{interface: <L1 IF の id>}・{lag: <LAG の id>}・{ethernet_segment: <ES の id>} と、その機器 */
export interface BridgePortData {
  interface?: string
  lag?: string
  ethernet_segment?: string
  nodes: string[]
}

/** Ethernet Segment の脚。{lag:} か {interface:} と、その機器 (mlndl ADR-0023) */
export interface SegmentMemberData {
  lag?: string
  interface?: string
  node: string
}

/** 機器に載せる bridge (type=bridge の要素そのまま) */
export interface NodeBridge {
  id: string
  name?: string
  ports: BridgePortData[]
  description?: string
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
  type: 'link' | 'attaches_to' | 'vlan_member' | 'routing_neighbor'
  // L1
  link_speed?: string
  link_role?: string
  description?: string       // 人が読む補足。YAML に書かれたまま (ADR-0011 D7)
  source_if?: string
  target_if?: string
  lag_id?: string
  /** その端の L1 IF がメンバーの LAG。LAG は機器 1 台なので、両端が別々の LAG のメンバーになりうる (mlndl ADR-0023) */
  source_lag?: string
  target_lag?: string
  /** 端の L1 IF が脚の Ethernet Segment (mlndl ADR-0023。旧 lag_type: mlag の代わり) */
  ethernet_segment?: string
  // L2 VLAN メンバー: trunk(tagged) / access(untagged) で区別
  vlan_id?: number
  tagged_on?: string[]
  untagged_on?: string[]
  /** 旧形式（後方互換フォールバック）*/
  interfaces?: string[]
  /** このノードの VLAN のポートの対向にいる VLAN の端点 */
  endpoints?: VlanEndpointData[]
  // 制御プレーンのセッション (type=routing_neighbor。ADR-0010 D11)。1 セッション = 1 辺
  protocol?: 'bgp' | 'ospf' | 'isis'
  instance?: string
  /** インスタンスの VRF。default VRF なら出ない */
  vrf?: string
  from?: SessionEndData
  to?: SessionEndData
  /** ebgp / ibgp。両端の AS から導いた値 */
  bgp_type?: string
  address_families?: string[]
  /** single-hop の通り道 (update_source の L3 IF から導いた値)。multihop・SVI・トポロジー外では出ない */
  transport_link?: TransportLink
  bfd?: boolean
  area?: string      // OSPF
  level?: string     // IS-IS
  label?: string
  local_as?: number
}

/** セッションの片端。トポロジー外の相手は address と local_as だけ */
export interface SessionEndData {
  node?: string
  address?: string
  l3_interface?: string
  /** OSPF / IS-IS の端点の IF の id */
  interface?: string
  interface_name?: string
  ip?: string
  ipv6?: string
  unnumbered?: boolean
  local_as?: number
  route_reflector_client?: boolean
}

/** セッションの通り道 (ADR-0010 D7 / ADR-0018 D5)。どれか 1 つのキーだけを持つ */
export interface TransportLink {
  link?: string
  /** 両端の LAG */
  lag?: string[]
  /** 両端の L1 リンクの対向がポートになっている bridge (事業者網の箱の中の L2 の転送) */
  bridge?: string
  /** 両端のトンネル IF (from の側, to の側) */
  tunnel?: string[]
}

/** ノードの bgp_sessions の 1 件。local はこの機器の端、peer は相手の端 */
export interface NodeBgpSession {
  id: string
  instance?: string
  vrf?: string
  bgp_type?: string
  address_families: string[]
  transport_link?: TransportLink
  bfd: boolean
  local: SessionEndData
  peer: SessionEndData
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
