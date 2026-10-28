/**
 * useViewTransform — ズーム・パン・ビューポートフィット
 */
import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { animateValue, prefersReducedMotion } from '../utils/animate'

export interface Transform { x: number; y: number; k: number }

export function useViewTransform(svgRef: RefObject<SVGSVGElement | null>) {
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [panning, setPanning] = useState(false)

  // focusOn から最新 tf を読むためのミラー（render 中の ref 読み取りを避ける）
  const tfRef = useRef(tf)
  useEffect(() => { tfRef.current = tf })

  // ── ホイール拡縮 ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    setTf(prev => {
      const k = Math.max(0.1, Math.min(8, prev.k * factor))
      return {
        x: mx - (mx - prev.x) * (k / prev.k),
        y: my - (my - prev.y) * (k / prev.k),
        k,
      }
    })
  }, [svgRef])

  // ── ドラッグパン（move/up はクロージャで登録し自己参照を避ける）──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as SVGElement).closest('.clickable')) return
    const ox = e.clientX, oy = e.clientY, tx = tf.x, ty = tf.y
    const move = (ev: MouseEvent) => {
      setTf(prev => ({ ...prev, x: tx + (ev.clientX - ox), y: ty + (ev.clientY - oy) }))
    }
    const up = () => {
      setPanning(false)
      window.removeEventListener('mousemove', move)
    }
    setPanning(true)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up, { once: true })
  }, [tf])

  // ── グラフをビューポートにフィット ──
  // マウント直後は svg のレイアウトが未確定で rect が 0x0 になることがあるため
  // rAF で数フレームリトライする
  const fitTo = useCallback((graphW: number, graphH: number) => {
    const attempt = (tries: number) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) {
        if (tries > 0) requestAnimationFrame(() => attempt(tries - 1))
        return
      }
      const pad = 80
      const k = Math.min(
        (rect.width  - pad * 2) / graphW,
        (rect.height - pad * 2) / graphH,
        1.4
      )
      setTf({
        x: (rect.width  - graphW * k) / 2,
        y: (rect.height - graphH * k) / 2,
        k,
      })
    }
    attempt(10)
  }, [svgRef])

  // ── 指定グラフ座標へスムーズにフォーカス ──
  const focusOn = useCallback((gx: number, gy: number, minK = 1.2) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const from = tfRef.current
    const k = Math.max(from.k, minK)
    const to = { x: rect.width / 2 - gx * k, y: rect.height / 2 - gy * k, k }
    if (prefersReducedMotion()) { setTf(to); return }
    animateValue(300, t => setTf({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      k: from.k + (to.k - from.k) * t,
    }))
  }, [svgRef])

  return { tf, setTf, panning, onWheel, onMouseDown, fitTo, focusOn }
}
