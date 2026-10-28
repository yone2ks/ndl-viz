/**
 * networkIcons.tsx — ネットワーク機器 SVG アイコン集
 *
 * 各アイコンは (cx, cy, w, h, fill, stroke) を受け取り、
 * そのバウンディングボックス内に収まる SVG 要素を返す。
 *
 * TopologyGraphSVG の `iconRegistry` prop に渡すことで
 * role ごとのデフォルトアイコンを差し替えられる。
 */
import type { ReactNode } from 'react'

// ── 型定義 ──────────────────────────────────────────────────────────────

export interface IconProps {
  cx: number   // 中心 X
  cy: number   // 中心 Y
  w: number    // 幅
  h: number    // 高さ
  fill: string
  stroke: string
}

export type IconRenderer = (props: IconProps) => ReactNode

// ── ヘルパー ─────────────────────────────────────────────────────────────

/** バウンディングボックス内に収める係数（余白を確保）*/
const S = 0.82

// ── Spine / Core — Cisco L3 スイッチ風 ──────────────────────────────────
// 横長矩形 + 上辺ポート列 + 内部ネットワーク記号（菱形）

export function SpineSwitchIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const bw = w * S, bh = h * S * 0.70
  const bx = cx - bw / 2, by = cy - bh / 2

  // ポート小矩形（上辺）
  const portCount = 6, portW = bw / (portCount * 2), portH = bh * 0.25
  const ports = Array.from({ length: portCount }, (_, i) => {
    const px = bx + portW * (2 * i + 0.5)
    return <rect key={i} x={px} y={by - portH} width={portW * 0.8} height={portH}
      rx={1} fill={stroke} opacity={0.85} />
  })

  // 内部菱形（ネットワーク記号）
  const dm = Math.min(bw, bh) * 0.30
  const dp = `${cx},${cy - dm} ${cx + dm},${cy} ${cx},${cy + dm} ${cx - dm},${cy}`

  return (
    <>
      {ports}
      <rect x={bx} y={by} width={bw} height={bh} rx={4}
        fill={fill} stroke={stroke} strokeWidth={1.8} />
      <polygon points={dp} fill="none" stroke={stroke} strokeWidth={1.4} opacity={0.75} />
    </>
  )
}

// ── Leaf — L2/L3 アクセス/ディストリビューションスイッチ ────────────────
// SpineSwitch より小ポート列 + 内部ライン

export function LeafSwitchIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const bw = w * S, bh = h * S * 0.72
  const bx = cx - bw / 2, by = cy - bh / 2
  const portCount = 8, portW = bw / (portCount * 2.2), portH = bh * 0.20
  const ports = Array.from({ length: portCount }, (_, i) => {
    const px = bx + portW * (2.2 * i + 0.4)
    return <rect key={i} x={px} y={by - portH + 1} width={portW * 0.85} height={portH}
      rx={1} fill={stroke} opacity={0.80} />
  })
  // 内部横ライン2本
  const ly1 = by + bh * 0.30, ly2 = by + bh * 0.65
  return (
    <>
      {ports}
      <rect x={bx} y={by} width={bw} height={bh} rx={4}
        fill={fill} stroke={stroke} strokeWidth={1.8} />
      <line x1={bx + 6} y1={ly1} x2={bx + bw - 6} y2={ly1}
        stroke={stroke} strokeWidth={1} opacity={0.55} />
      <line x1={bx + 6} y1={ly2} x2={bx + bw - 6} y2={ly2}
        stroke={stroke} strokeWidth={1} opacity={0.55} />
    </>
  )
}

// ── Server — ラックマウントサーバー ─────────────────────────────────────
// 縦長矩形 + 水平ドライブベイライン3本

export function ServerIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const bw = w * S * 0.65, bh = h * S * 0.85
  const bx = cx - bw / 2, by = cy - bh / 2
  const lines = [0.25, 0.50, 0.75].map((frac, i) => {
    const lx = bx + bw * 0.15, ly = by + bh * frac
    return <line key={i} x1={lx} y1={ly} x2={bx + bw * 0.85} y2={ly}
      stroke={stroke} strokeWidth={1} opacity={0.60} />
  })
  // 電源ランプ
  return (
    <>
      <rect x={bx} y={by} width={bw} height={bh} rx={3}
        fill={fill} stroke={stroke} strokeWidth={1.8} />
      {lines}
      <circle cx={bx + bw * 0.85} cy={by + bh * 0.20} r={2.5}
        fill={stroke} opacity={0.70} />
    </>
  )
}

// ── Firewall — 盾形 ──────────────────────────────────────────────────────

export function FirewallIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const sw2 = w * S * 0.50, sh = h * S * 0.80
  // 盾: 上辺水平 + 両サイド斜め + 下部 V字
  const x0 = cx - sw2, x1 = cx + sw2
  const y0 = cy - sh * 0.50
  const ym = cy + sh * 0.10
  const yb = cy + sh * 0.50
  const pts = `${x0},${y0} ${x1},${y0} ${x1},${ym} ${cx},${yb} ${x0},${ym}`
  // 内部炎風のX印
  return (
    <>
      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.8}
        strokeLinejoin="round" />
      <line x1={cx - sw2 * 0.4} y1={y0 + (ym - y0) * 0.2}
            x2={cx + sw2 * 0.4} y2={y0 + (ym - y0) * 0.8}
            stroke={stroke} strokeWidth={1.5} opacity={0.65} />
      <line x1={cx + sw2 * 0.4} y1={y0 + (ym - y0) * 0.2}
            x2={cx - sw2 * 0.4} y2={y0 + (ym - y0) * 0.8}
            stroke={stroke} strokeWidth={1.5} opacity={0.65} />
    </>
  )
}

// ── Load Balancer — スケール（天秤）風 ───────────────────────────────────

export function LoadBalancerIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const bw = w * S * 0.88, bh = h * S * 0.72
  const bx = cx - bw / 2, by = cy - bh / 2
  // 背景矩形
  // 内部に均等分配を表す矢印風ライン: 上1→下2
  const mx = cx, my = by + bh * 0.28
  const y2 = by + bh * 0.72
  return (
    <>
      <rect x={bx} y={by} width={bw} height={bh} rx={5}
        fill={fill} stroke={stroke} strokeWidth={1.8} />
      {/* 上 → 中央 */}
      <line x1={mx} y1={by + 4} x2={mx} y2={my}
        stroke={stroke} strokeWidth={1.4} opacity={0.75} />
      {/* 中央 → 左下 */}
      <line x1={mx} y1={my} x2={bx + bw * 0.28} y2={y2}
        stroke={stroke} strokeWidth={1.4} opacity={0.75} />
      {/* 中央 → 右下 */}
      <line x1={mx} y1={my} x2={bx + bw * 0.72} y2={y2}
        stroke={stroke} strokeWidth={1.4} opacity={0.75} />
    </>
  )
}

// ── Hypervisor — VM バッジ付き cutrect ──────────────────────────────────

export function HypervisorIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const bw = w * S, bh = h * S * 0.72
  const cut = 9
  const bx = cx - bw / 2, by = cy - bh / 2, bx2 = bx + bw, by2 = by + bh
  const pts = [
    `${bx + cut},${by}`, `${bx2 - cut},${by}`,
    `${bx2},${by + cut}`, `${bx2},${by2 - cut}`,
    `${bx2 - cut},${by2}`, `${bx + cut},${by2}`,
    `${bx},${by2 - cut}`, `${bx},${by + cut}`,
  ].join(' ')
  return (
    <>
      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.8} />
      {/* VM テキストバッジ */}
      <text x={cx} y={cy + 1} fill={stroke} fontSize={10} fontWeight={800}
        textAnchor="middle" dominantBaseline="middle" opacity={0.80}
        style={{ fontFamily: '"SF Mono","Fira Code",monospace', pointerEvents: 'none' }}>
        VM
      </text>
    </>
  )
}

// ── Generic Router — 円 + 十字矢印 ──────────────────────────────────────

export function RouterIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const r = Math.min(w, h) * S * 0.42
  const ar = r * 0.55
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={1.8} />
      {/* 十字矢印 */}
      <line x1={cx - ar} y1={cy} x2={cx + ar} y2={cy}
        stroke={stroke} strokeWidth={1.3} opacity={0.70} />
      <line x1={cx} y1={cy - ar} x2={cx} y2={cy + ar}
        stroke={stroke} strokeWidth={1.3} opacity={0.70} />
      <polygon points={`${cx + ar},${cy - 3} ${cx + ar + 5},${cy} ${cx + ar},${cy + 3}`}
        fill={stroke} opacity={0.70} />
      <polygon points={`${cx - ar},${cy - 3} ${cx - ar - 5},${cy} ${cx - ar},${cy + 3}`}
        fill={stroke} opacity={0.70} />
    </>
  )
}

// ── Management — タグ風矩形 ──────────────────────────────────────────────

export function ManagementIcon({ cx, cy, w, h, fill, stroke }: IconProps): ReactNode {
  const bw = w * S, bh = h * S * 0.62
  const bx = cx - bw / 2, by = cy - bh / 2
  const notch = bh * 0.40
  // 右辺に V ノッチ（タグ形状）
  const pts = [
    `${bx},${by}`, `${bx + bw - notch},${by}`,
    `${bx + bw},${by + bh / 2}`,
    `${bx + bw - notch},${by + bh}`, `${bx},${by + bh}`,
  ].join(' ')
  return (
    <>
      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.8}
        strokeLinejoin="round" />
      {/* 内部 gear 風円 */}
      <circle cx={cx - bw * 0.10} cy={cy} r={bh * 0.22}
        fill="none" stroke={stroke} strokeWidth={1.2} opacity={0.60} />
    </>
  )
}

// ── デフォルトレジストリ ──────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- アイコン群と一体のレジストリファイル
export const defaultIconRegistry: Record<string, IconRenderer> = {
  spine:          SpineSwitchIcon,
  core:           SpineSwitchIcon,
  aggregation:    LeafSwitchIcon,
  distribution:   LeafSwitchIcon,
  leaf:           LeafSwitchIcon,
  server:         ServerIcon,
  firewall:       FirewallIcon,
  'load-balancer': LoadBalancerIcon,
  hypervisor:     HypervisorIcon,
  management:     ManagementIcon,
  border:         RouterIcon,
}
