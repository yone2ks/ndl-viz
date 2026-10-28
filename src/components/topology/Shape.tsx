/**
 * Shape — role 別の SVG 幾何シェイプ描画コンポーネント
 */

interface ShapeProps { x:number; y:number; w:number; h:number; shape:string; fill:string; stroke:string }

export function Shape({ x, y, w, h, shape, fill, stroke }: ShapeProps) {
  const sw = 1.8
  switch (shape) {
    case 'diamond': {
      const p = `${x},${y - h/2} ${x + w/2},${y} ${x},${y + h/2} ${x - w/2},${y}`
      return <polygon points={p} fill={fill} stroke={stroke} strokeWidth={sw} />
    }
    case 'ellipse':
      return <ellipse cx={x} cy={y} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw} />
    case 'hexagon': {
      const r = Math.min(w, h) / 2
      const p = Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60 - 30) * Math.PI / 180
        return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`
      }).join(' ')
      return <polygon points={p} fill={fill} stroke={stroke} strokeWidth={sw} />
    }
    case 'octagon': {
      const r = Math.min(w, h) / 2
      const p = Array.from({ length: 8 }, (_, i) => {
        const a = i * 45 * Math.PI / 180
        return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`
      }).join(' ')
      return <polygon points={p} fill={fill} stroke={stroke} strokeWidth={sw} />
    }
    case 'cutrect': {
      const cut = 11
      const p = [
        `${x - w/2 + cut},${y - h/2}`, `${x + w/2 - cut},${y - h/2}`,
        `${x + w/2},${y - h/2 + cut}`, `${x + w/2},${y + h/2 - cut}`,
        `${x + w/2 - cut},${y + h/2}`, `${x - w/2 + cut},${y + h/2}`,
        `${x - w/2},${y + h/2 - cut}`, `${x - w/2},${y - h/2 + cut}`,
      ].join(' ')
      return <polygon points={p} fill={fill} stroke={stroke} strokeWidth={sw} />
    }
    default: // roundrect
      return <rect x={x - w/2} y={y - h/2} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={sw} />
  }
}
