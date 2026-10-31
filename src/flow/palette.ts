/**
 * palette.ts — v2 デザイントークン (role 色・エッジ色)
 */

export interface RoleStyle { accent: string; glyph: string; label: string }

export const ROLE_STYLE: Record<string, RoleStyle> = {
  spine:          { accent: '#60A5FA', glyph: 'switch-l3', label: 'Spine' },
  core:           { accent: '#A78BFA', glyph: 'switch-l3', label: 'Core' },
  distribution:   { accent: '#FBBF24', glyph: 'switch-l3', label: 'Distribution' },
  access:         { accent: '#2DD4BF', glyph: 'switch-l2', label: 'Access' },
  aggregation:    { accent: '#FBBF24', glyph: 'switch-l3', label: 'Aggregation' },
  leaf:           { accent: '#34D399', glyph: 'switch-l2', label: 'Leaf' },
  border:         { accent: '#FB923C', glyph: 'router',    label: 'Border' },
  server:         { accent: '#94A3B8', glyph: 'server',    label: 'Server' },
  firewall:       { accent: '#F87171', glyph: 'firewall',  label: 'Firewall' },
  'load-balancer':{ accent: '#FB923C', glyph: 'lb',        label: 'LB' },
  hypervisor:     { accent: '#22D3EE', glyph: 'hypervisor',label: 'Hypervisor' },
  management:     { accent: '#9CA3AF', glyph: 'mgmt',      label: 'Mgmt' },
}
export const ROLE_DEFAULT: RoleStyle = { accent: '#7C8CF8', glyph: 'node', label: 'Node' }

export const roleStyle = (role?: string): RoleStyle =>
  (role && ROLE_STYLE[role]) || ROLE_DEFAULT

export const EDGE_COLOR = {
  underlay:   '#3B82F6',
  peerlink:   '#F59E0B',
  wan:        '#F472B6',
  access:     '#64748B',
  management: '#64748B',
  lag:        '#10B981',
  routing:    '#34D399',
  ebgp:       '#FB923C',
  ibgp:       '#A78BFA',
  vlan:       '#FBBF24',
  attach:     '#64748B',
} as const

/** 線の見た目。エッジと凡例で同じものを使う */
export interface LineStyle { color: string; dash?: string; width: number }

/** L1 リンクの見た目。LAG > link_role の順で決める */
export function linkStyle(role: string, isLag: boolean): LineStyle {
  if (isLag) return { color: EDGE_COLOR.lag, width: 2.2 }
  switch (role) {
    case 'underlay':   return { color: EDGE_COLOR.underlay, width: 2.2 }
    case 'peer-link':  return { color: EDGE_COLOR.peerlink, dash: '8 5', width: 2.2 }
    case 'wan':        return { color: EDGE_COLOR.wan, dash: '14 7', width: 2.2 }
    case 'management': return { color: EDGE_COLOR.management, dash: '2 5', width: 2.2 }
    default:           return { color: EDGE_COLOR.access, width: 2.2 }
  }
}

/** オーバーレイの線の見た目 */
export const OVERLAY_STYLE = {
  routing: { color: EDGE_COLOR.routing, dash: '8 4', width: 1.8 },
  ebgp:    { color: EDGE_COLOR.ebgp, width: 2.2 },
  ibgp:    { color: EDGE_COLOR.ibgp, dash: '8 4', width: 1.8 },
  vlan:    { color: EDGE_COLOR.vlan, dash: '3 5', width: 1.6 },
  attach:  { color: EDGE_COLOR.attach, dash: '5 5', width: 1.4 },
} satisfies Record<string, LineStyle>

export function vrfColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 70%, 65%)`
}
