/**
 * VlanNode — VLAN / ブロードキャストドメインのノード (L2 overlay)
 *
 * 普段は VLAN 番号とサブネットだけの札で出す（多数の VLAN が重ならないよう、配置も札の大きさで決める）。
 * 選んだ VLAN（札を押す・機器の SVI チップを押す）だけ、札の上にカードを広げて詳細を出す。
 * カードには VNI / L3VNI のタブを並べ、押すとその VNI が載る VTEP 間のトンネルを描く (VxlanTunnels)。
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import type { CyNodeData } from '../types/topology'

export const VlanNode = memo(function VlanNode({ id, data, selected }: NodeProps) {
  const nd = data as unknown as CyNodeData & { hue?: number; pillW?: number }
  const { overlays, vniByVlan, sviByVlan, hoveredId, setHoveredId, adjacency,
    query, matchedIds, focusVlanId, focusVniId, setFocusVniId, vniFocusNodes, bundle,
    focusVrf, selectVrf, vrfFocusNodes } = useFlowCtx()
  const visible = overlays.has('l2')
  const open = focusVlanId === id
  const title = nd.label?.split('\n')[0] ?? nd.id
  const name = nd.label?.split('\n')[1]
  const pillSubnet = nd.subnet ?? nd.subnet_v6
  const vnis = vniByVlan.get(nd.id) ?? []
  const svis = sviByVlan.get(nd.id) ?? []
  const hue = nd.hue ?? 40
  const searchActive = query !== ''
  const dim = searchActive
    ? !matchedIds.has(id)
    : bundle
      ? true
    : vniFocusNodes ?? vrfFocusNodes
      ? !(vniFocusNodes ?? vrfFocusNodes)!.has(id)
      : hoveredId !== null && hoveredId !== id && !adjacency.get(hoveredId)?.has(id)

  return (
    <div
      className={`vlan-node${visible ? '' : ' is-hidden'}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${open ? ' is-open' : ''}`}
      style={{ '--vhue': hue, width: nd.pillW } as React.CSSProperties}
      onMouseEnter={() => setHoveredId(id)}
      onMouseLeave={() => setHoveredId(null)}>
      <Handle type="target" position={Position.Top} className="hidden-handle" />
      <Handle type="source" position={Position.Top} className="hidden-handle" />

      <div className="vlan-pill">
        <span className="vlan-pill-title">{title}</span>
        {pillSubnet && <code>{pillSubnet}</code>}
      </div>

      {/* 選んだ VLAN だけ広げる。札の上に重ねるので、配置（札の大きさ）は変わらない */}
      {open && (
        <div className="vlan-card">
          <div className="vlan-head">
            <span className="vlan-title">{title}</span>
            {name && <span className="vlan-name">{name}</span>}
          </div>

          {vnis.length > 0 && (
            <div className="vlan-vnis">
              {vnis.map(v => {
                const active = focusVniId === v.id
                return (
                  <button key={v.id} type="button"
                    className={`vni-tab${v.type === 'l3vni' ? ' is-l3' : ''}${active ? ' is-active' : ''}`}
                    onClick={e => {
                      e.stopPropagation()
                      setFocusVniId(active ? null : v.id)
                    }}>
                    {v.type === 'l3vni' ? `L3VNI ${v.vni}` : `VNI ${v.vni}`}
                  </button>
                )
              })}
            </div>
          )}

          <div className="vlan-body">
            {nd.subnet && <div className="vlan-row"><span>Subnet</span><code>{nd.subnet}</code></div>}
            {nd.subnet_v6 && <div className="vlan-row"><span>Subnet</span><code>{nd.subnet_v6}</code></div>}
            {nd.gateway && <div className="vlan-row"><span>GW</span><code>{nd.gateway}</code></div>}
            {/* 押すとその VRF に絞る (もう一度押すと外す) */}
            {nd.vrf_name && <div className="vlan-row"><span>VRF</span>
              <button type="button" className={`vlan-vrf nodrag${focusVrf === nd.vrf_name ? ' is-focused' : ''}`}
                onClick={e => { e.stopPropagation(); selectVrf(focusVrf === nd.vrf_name ? null : nd.vrf_name!) }}>
                <code>{nd.vrf_name}</code>
              </button></div>}
          </div>

          {/* 選んだ VLAN の SVI は機器カードでも Layer 3 の切り替えによらず出すので、ここでも常に出す */}
          {svis.length > 0 && (
            <div className="vlan-svis">
              <div className="vlan-svis-title">SVI</div>
              {svis.map(s => (
                <div key={s.node} className="vlan-row">
                  <span>{s.label}</span><code>{s.ip}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
