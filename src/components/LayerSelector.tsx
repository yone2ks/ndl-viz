import type { OverlayKey } from '../types/topology'

interface Props {
  overlays: Set<OverlayKey>
  onChange: (overlays: Set<OverlayKey>) => void
  viewMode: 'flat' | 'stack'
  onViewModeChange: (mode: 'flat' | 'stack') => void
}

const OVERLAYS: { key: OverlayKey; label: string; color: string }[] = [
  { key: 'l2',  label: '+ L2 VLAN',    color: '#F59E0B' },
  { key: 'l3',  label: '+ L3 ルーティング', color: '#059669' },
  { key: 'bgp', label: '+ BGP',         color: '#EA580C' },
]

export default function LayerSelector({ overlays, onChange, viewMode, onViewModeChange }: Props) {
  const toggle = (key: OverlayKey) => {
    const next = new Set(overlays)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  return (
    <div className="layer-selector">
      {/* L1 は常時表示（固定） */}
      <span className="layer-btn active" style={{ cursor: 'default', opacity: 0.8 }}>
        L1 物理
      </span>

      {OVERLAYS.map(({ key, label, color }) => {
        const active = overlays.has(key)
        return (
          <button
            key={key}
            className={`layer-btn ${active ? 'active' : ''}`}
            style={active ? { background: color, borderColor: color } : {}}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        )
      })}

      {/* 2.5D レイヤースタックビュー切替 */}
      <button
        className={`layer-btn ${viewMode === 'stack' ? 'active' : ''}`}
        style={viewMode === 'stack' ? { background: '#0891B2', borderColor: '#0891B2' } : {}}
        onClick={() => onViewModeChange(viewMode === 'stack' ? 'flat' : 'stack')}
        title="レイヤーを 2.5D スタック表示 (RFC 8345 supporting 関係の可視化)"
      >
        ⧉ Stack
      </button>
    </div>
  )
}
