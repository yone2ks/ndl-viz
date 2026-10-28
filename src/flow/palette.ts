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

export function vrfColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 70%, 65%)`
}
