/**
 * theme.ts — role 別ビジュアル設定・リンク色・テーマ UI 色
 */

export interface RoleCfg { fill:string; stroke:string; shape:string; w:number; h:number }

export const ROLES_DARK: Record<string, RoleCfg> = {
  spine:          { fill:'#0c1c35', stroke:'#4A90D9', shape:'diamond',   w:80, h:80 },
  core:           { fill:'#18093a', stroke:'#7C3AED', shape:'diamond',   w:80, h:80 },
  aggregation:    { fill:'#1a1200', stroke:'#F59E0B', shape:'hexagon',   w:72, h:72 },
  distribution:   { fill:'#081c1c', stroke:'#06B6D4', shape:'roundrect', w:88, h:52 },
  leaf:           { fill:'#061812', stroke:'#059669', shape:'roundrect', w:92, h:54 },
  border:         { fill:'#1c1000', stroke:'#D97706', shape:'hexagon',   w:70, h:70 },
  server:         { fill:'#0f1520', stroke:'#64748B', shape:'ellipse',   w:60, h:46 },
  firewall:       { fill:'#1a0505', stroke:'#DC2626', shape:'octagon',   w:64, h:64 },
  'load-balancer':{ fill:'#1a0d04', stroke:'#EA580C', shape:'roundrect', w:80, h:50 },
  hypervisor:     { fill:'#04111e', stroke:'#0891B2', shape:'cutrect',   w:84, h:54 },
  management:     { fill:'#111111', stroke:'#6B7280', shape:'roundrect', w:76, h:46 },
}
export const ROLES_LIGHT: Record<string, RoleCfg> = {
  spine:          { fill:'#dbeafe', stroke:'#1d4ed8', shape:'diamond',   w:80, h:80 },
  core:           { fill:'#ede9fe', stroke:'#6d28d9', shape:'diamond',   w:80, h:80 },
  aggregation:    { fill:'#fef9c3', stroke:'#b45309', shape:'hexagon',   w:72, h:72 },
  distribution:   { fill:'#ecfeff', stroke:'#0e7490', shape:'roundrect', w:88, h:52 },
  leaf:           { fill:'#dcfce7', stroke:'#059669', shape:'roundrect', w:92, h:54 },
  border:         { fill:'#fff7ed', stroke:'#c2410c', shape:'hexagon',   w:70, h:70 },
  server:         { fill:'#f1f5f9', stroke:'#475569', shape:'ellipse',   w:60, h:46 },
  firewall:       { fill:'#fee2e2', stroke:'#b91c1c', shape:'octagon',   w:64, h:64 },
  'load-balancer':{ fill:'#ffedd5', stroke:'#c2410c', shape:'roundrect', w:80, h:50 },
  hypervisor:     { fill:'#cffafe', stroke:'#0e7490', shape:'cutrect',   w:84, h:54 },
  management:     { fill:'#f1f5f9', stroke:'#6b7280', shape:'roundrect', w:76, h:46 },
}
const ROLE_DEF_DARK: RoleCfg = { fill:'#0f1520', stroke:'#475569', shape:'roundrect', w:80, h:50 }
const ROLE_DEF_LIGHT: RoleCfg = { fill:'#f8fafc', stroke:'#64748b', shape:'roundrect', w:80, h:50 }

/** shape / w / h はテーマ間で共通。色だけテーマで変わる。 */
export const rcfg = (role?: string, theme: 'dark'|'light' = 'dark'): RoleCfg => {
  const map  = theme === 'light' ? ROLES_LIGHT : ROLES_DARK
  const def  = theme === 'light' ? ROLE_DEF_LIGHT : ROLE_DEF_DARK
  return role ? (map[role] ?? def) : def
}

// ── リンク・オーバーレイ色 ──────────────────────────────────────────────

export const LINK_COLOR: Record<string, string> = {
  underlay:    '#2563EB',
  'peer-link': '#D97706',
  access:      '#6B7280',
  management:  '#4B5563',
}
export const LINK_DASH: Record<string, string> = {
  'peer-link': '7 3',
  management:  '2 4',
}
export const LAG_COLOR: Record<string, { line:string; bg:string }> = {
  lacp: { line:'#059669', bg:'rgba(5,150,105,0.16)' },
  mlag: { line:'#059669', bg:'rgba(5,150,105,0.16)' },  // LACP と同色。識別はドメインボックスで
}

// ── VRF 名 → 色（ハッシュベースの色相割当）─────────────────────────────

export function vrfColor(name: string, theme: 'dark'|'light' = 'dark'): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return theme === 'dark'
    ? `hsl(${hue}, 65%, 62%)`
    : `hsl(${hue}, 60%, 38%)`
}

// ── テーマ別 UI 色（SVG テキスト・背景）────────────────────────────────

export interface ThemeUi {
  canvasBg: string
  labelText: string
  labelDim: string
  speedText: string
  ifText: string
  legendBg: string
  legendBorder: string
  legendTitle: string
  linkDefault: string
}
export const THEME_UI: Record<'dark'|'light', ThemeUi> = {
  dark: {
    canvasBg:    '#080a12',
    labelText:   '#e2e8f0',
    labelDim:    '#34d399',   // loopback IP (green on dark)
    speedText:   '#4a5f7a',
    ifText:      '#3d4f64',
    legendBg:    'rgba(10,12,20,0.93)',
    legendBorder:'#1e2336',
    legendTitle: '#4B5563',
    linkDefault: '#3f4f6b',
  },
  light: {
    canvasBg:    '#f0f3f8',
    labelText:   '#1e293b',
    labelDim:    '#059669',   // loopback IP (green on light)
    speedText:   '#64748b',
    ifText:      '#94a3b8',
    legendBg:    'rgba(255,255,255,0.95)',
    legendBorder:'#dde1ea',
    legendTitle: '#94a3b8',
    linkDefault: '#94a3b8',
  },
}
