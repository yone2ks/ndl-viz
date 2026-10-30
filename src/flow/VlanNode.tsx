/**
 * VlanNode — VLAN / ブロードキャストドメインのカードノード (L2 overlay)
 *
 * VNI / L3VNI バインディングをタブとして右肩に表示する (supporting 関係)。
 * タブをクリックすると、その VNI が載る VTEP 間のトンネルを描く (VxlanTunnels)。
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import { useT } from '../i18n'
import type { CyNodeData } from '../types/topology'

export const VlanNode = memo(function VlanNode({ id, data, selected }: NodeProps) {
  const nd = data as unknown as CyNodeData & { hue?: number }
  const t = useT()
  const { overlays, vniByVlan, sviByVlan, hoveredId, setHoveredId, adjacency,
    query, matchedIds, focusVniId, setFocusVniId } = useFlowCtx()
  const visible = overlays.has('l2')
  const title = nd.label?.split('\n')[0] ?? nd.id
  const name = nd.label?.split('\n')[1]
  const vnis = vniByVlan.get(nd.id) ?? []
  const hue = nd.hue ?? 40
  const searchActive = query !== ''
  const dim = searchActive
    ? !matchedIds.has(id)
    : hoveredId !== null && hoveredId !== id && !adjacency.get(hoveredId)?.has(id)

  return (
    <div
      className={`vlan-card${visible ? '' : ' is-hidden'}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      style={{ '--vhue': hue } as React.CSSProperties}
      onMouseEnter={() => setHoveredId(id)}
      onMouseLeave={() => setHoveredId(null)}>
      <Handle type="target" position={Position.Top} className="hidden-handle" />
      <Handle type="source" position={Position.Top} className="hidden-handle" />

      {vnis.length > 0 && (
        <div className="vlan-vni-tabs">
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

      <div className="vlan-head">
        <span className="vlan-title">{title}</span>
        {name && <span className="vlan-name">{name}</span>}
      </div>
      <div className="vlan-body">
        {nd.subnet && <div className="vlan-row"><span>Subnet</span><code>{nd.subnet}</code></div>}
        {nd.gateway && <div className="vlan-row"><span>GW</span><code>{nd.gateway}</code></div>}
        {nd.vrf_name && <div className="vlan-row"><span>VRF</span><code>{nd.vrf_name}</code></div>}
      </div>

      {/* SVI (VLAN IF) 一覧 — L3 overlay ON 時のみ */}
      {overlays.has('l3') && (sviByVlan.get(nd.id)?.length ?? 0) > 0 && (
        <div className="vlan-svis">
          <div className="vlan-svis-title">SVI</div>
          {sviByVlan.get(nd.id)!.slice(0, 4).map(s => (
            <div key={s.node} className="vlan-row">
              <span>{s.label}</span><code>{s.ip}</code>
            </div>
          ))}
          {sviByVlan.get(nd.id)!.length > 4 && (
            <div className="vlan-row"><span>{t.moreNodes(sviByVlan.get(nd.id)!.length - 4)}</span></div>
          )}
        </div>
      )}
    </div>
  )
})
