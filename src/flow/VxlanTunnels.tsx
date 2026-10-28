/**
 * VxlanTunnels — フォーカス中の VNI が載る VTEP 間に VXLAN トンネルを描く (L2 overlay)
 *
 * 外管 = VTEP の組ごとに 1 本の IP トンネル、内側の線 = フォーカス中の VNI。
 * VNI は VXLAN ヘッダーのフィールドでトンネルは VNI ごとに分かれないので、
 * 同じ VTEP の組に載るほかの VNI はラベルに並べる。
 * トンネルは mlndl の VNI.vteps から導く（トンネル自体はエンティティではない。ADR-0014）。
 */
import { memo } from 'react'
import { ViewportPortal, useNodes, type Node } from '@xyflow/react'
import { useFlowCtx } from './FlowCtx'
import { useT } from '../i18n'
import { CARD_W, CARD_H } from './layout'
import type { CyNodeData } from '../types/topology'

const R = 7   // 管の半径

interface Box { x1: number; y1: number; x2: number; y2: number }

/** VTEP を終端するノード群を囲む箱（共有 VTEP は MLAG ペアをまとめた箱）*/
function unionBox(ns: Node[]): Box | null {
  if (!ns.length) return null
  const w = (n: Node) => n.measured?.width ?? CARD_W
  const h = (n: Node) => n.measured?.height ?? CARD_H
  return {
    x1: Math.min(...ns.map(n => n.position.x)),
    y1: Math.min(...ns.map(n => n.position.y)),
    x2: Math.max(...ns.map(n => n.position.x + w(n))),
    y2: Math.max(...ns.map(n => n.position.y + h(n))),
  }
}

/** 箱の中心から (tx, ty) へ向かう線が箱の縁と交わる点 */
function edgePoint(b: Box, tx: number, ty: number) {
  const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2
  const dx = tx - cx, dy = ty - cy
  const t = Math.min(dx ? (b.x2 - b.x1) / 2 / Math.abs(dx) : Infinity,
                     dy ? (b.y2 - b.y1) / 2 / Math.abs(dy) : Infinity)
  return { x: cx + dx * t, y: cy + dy * t }
}

const vniLabel = (v: CyNodeData) => (v.type === 'l3vni' ? `L3VNI ${v.vni}` : `VNI ${v.vni}`)

export const VxlanTunnels = memo(function VxlanTunnels() {
  const nodes = useNodes()
  const t = useT()
  const { overlays, focusVniId, vniById, vtepNodes, vlanHue } = useFlowCtx()
  const vni = focusVniId ? vniById.get(focusVniId) : undefined
  if (!vni || !overlays.has('l2')) return null

  const byId = new Map(nodes.map(n => [n.id, n]))
  const vteps = (vni.vteps ?? []) as string[]
  const boxOf = (vtep: string) =>
    unionBox((vtepNodes.get(vtep) ?? []).map(id => byId.get(id)).filter((n): n is Node => !!n))
  const color = vni.type === 'l3vni'
    ? '#8b5cf6'
    : `hsl(${vlanHue.get(vni.vlan ?? '') ?? 170}, 70%, 48%)`

  // VTEP の組ごとに 1 本。同じ組に載るほかの VNI も添える
  const pipes: { key: string; a: Box; b: Box; others: CyNodeData[] }[] = []
  vteps.forEach((va, i) => vteps.slice(i + 1).forEach(vb => {
    const a = boxOf(va), b = boxOf(vb)
    if (!a || !b) return
    const others = [...vniById.values()].filter(v => {
      const vs = (v.vteps ?? []) as string[]
      return v.id !== vni.id && vs.includes(va) && vs.includes(vb)
    })
    pipes.push({ key: `${va}~${vb}`, a, b, others })
  }))

  return (
    <ViewportPortal>
      <svg className="vx-tunnels" width="1" height="1"
        style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        {pipes.map(({ key, a, b }) => {
          const p = edgePoint(a, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2)
          const q = edgePoint(b, (a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2)
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
          const nx = -(q.y - p.y) / len * R, ny = (q.x - p.x) / len * R
          return (
            <g key={key} style={{ '--vx': color } as React.CSSProperties}>
              <line className="vx-shell" x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={R * 2} />
              <line className="vx-wall" x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} />
              <line className="vx-wall" x1={p.x - nx} y1={p.y - ny} x2={q.x - nx} y2={q.y - ny} />
              <line className="vx-core" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
              <circle className="vx-end" cx={p.x} cy={p.y} r={R + 2} />
              <circle className="vx-end" cx={q.x} cy={q.y} r={R + 2} />
            </g>
          )
        })}
      </svg>
      {pipes.map(({ key, a, b, others }) => {
        const mx = (a.x1 + a.x2 + b.x1 + b.x2) / 4
        const my = (a.y1 + a.y2 + b.y1 + b.y2) / 4
        // 同じ tier の VTEP どうし (横向き) はカードの間が狭いので、ラベルはカードの下に出す
        const flat = Math.abs(mx - (a.x1 + a.x2) / 2) > Math.abs(my - (a.y1 + a.y2) / 2)
        const ly = flat ? Math.max(a.y2, b.y2) + 8 : my + R + 10
        return (
          <div key={key} className="vx-pill"
            style={{ transform: `translate(-50%, 0) translate(${mx}px, ${ly}px)`,
              '--vx': color } as React.CSSProperties}>
            <span className="vx-pill-main">VXLAN · {vniLabel(vni)}</span>
            {others.length > 0 && (
              <span className="vx-pill-sub">{t.sameTunnel}: {others.map(vniLabel).join(' / ')}</span>
            )}
          </div>
        )
      })}
    </ViewportPortal>
  )
})
