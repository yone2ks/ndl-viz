/**
 * Legend — role 凡例 + リンク種別凡例（SVG 外の HTML オーバーレイ）
 */
import { memo } from 'react'
import type { OverlayKey } from '../../types/topology'
import { rcfg, THEME_UI } from './theme'

const ROLE_DESC: Record<string, string> = {
  spine:'Spine', core:'Core', aggregation:'Aggregation', distribution:'Distribution',
  leaf:'Leaf', border:'Border', server:'Server',
  firewall:'Firewall', 'load-balancer':'LB', hypervisor:'Hypervisor', management:'Mgmt',
}

export const LegendSVG = memo(function LegendSVG({ overlays, theme }: { overlays: Set<OverlayKey>; theme: 'dark'|'light' }) {
  const ui = THEME_UI[theme]
  const linkLines: { color:string; dash:string; label:string }[] = [
    { color:'#2563EB', dash:'',    label:'underlay' },
    { color:'#D97706', dash:'7 3', label:'peer-link' },
    { color:'#059669', dash:'',    label:'LACP bond //' },
    { color:'#059669', dash:'',    label:'MLAG member //' },
    { color:'#D97706', dash:'8 4', label:'MLAG domain' },
    ...(overlays.has('l3')  ? [{ color:'#059669', dash:'8 3', label:'routing adj' }] : []),
    ...(overlays.has('bgp') ? [
      { color:'#EA580C', dash:'',    label:'eBGP' },
      { color:'#7C3AED', dash:'8 3', label:'iBGP' },
    ] : []),
    ...(overlays.has('l2') ? [{ color:'#F59E0B', dash:'3 3', label:'VLAN member' }] : []),
  ]
  return (
    <div style={{ position:'absolute', bottom:40, left:12,
      background: ui.legendBg, border:`1px solid ${ui.legendBorder}`,
      borderRadius:7, padding:'9px 11px', fontSize:10 }}>
      <div style={{ color: ui.legendTitle, fontWeight:700, marginBottom:5, fontSize:9,
        letterSpacing:'0.09em', textTransform:'uppercase' }}>Legend</div>
      {Object.entries(ROLE_DESC).map(([role, label]) => {
        const cfg = rcfg(role, theme)
        return (
          <div key={role} style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
            <svg width={14} height={14} style={{ flexShrink:0 }}>
              <rect x={1} y={1} width={12} height={12} rx={2}
                fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5}/>
            </svg>
            <span style={{ color: ui.speedText }}>{label}</span>
          </div>
        )
      })}
      <div style={{ borderTop:`1px solid ${ui.legendBorder}`, marginTop:5, paddingTop:5 }}>
        {linkLines.map(({ color, dash, label }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
            <svg width={22} height={6} style={{ flexShrink:0 }}>
              <line x1={0} y1={3} x2={22} y2={3} stroke={color} strokeWidth={2}
                strokeDasharray={dash || undefined}/>
            </svg>
            <span style={{ color: ui.speedText }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
})
