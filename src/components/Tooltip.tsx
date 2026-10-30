/**
 * Tooltip — data-tip 属性を持つ要素にマウスを載せると、すぐに説明を出す
 *
 * ブラウザ標準の title 属性は 1 秒ほど止めないと出ず、埋め込みのブラウザでは出ないこともあるため使わない。
 * 1 つの要素を document 全体で使い回す（React Flow のノード内でも、ズームの transform に影響されない）。
 * 文言の改行（\n）はそのまま改行として出す。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const SHOW_DELAY_MS = 120
const GAP = 8

interface Tip { text: string; x: number; y: number; below: boolean }

export default function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const current = useRef<Element | null>(null)

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current)
      current.current = null
      setTip(null)
    }
    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null
      if (el === current.current) return
      hide()
      const text = el?.getAttribute('data-tip')
      if (!el || !text) return
      current.current = el
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        // 下に出す。画面の下端に近ければ上に出す
        const below = r.bottom + 60 < window.innerHeight
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below })
      }, SHOW_DELAY_MS)
    }
    // ウィンドウの外へ出たら閉じる
    const onOut = (e: PointerEvent) => { if (!e.relatedTarget) hide() }
    // 押すと文言が変わる要素（IF チップ等）があるので、押したら閉じる。ズーム・スクロールで位置がずれるのでそれでも閉じる
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('wheel', hide, { passive: true })
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('wheel', hide)
      window.removeEventListener('blur', hide)
    }
  }, [])

  const box = useRef<HTMLDivElement>(null)
  // 画面の左右からはみ出さないよう、描いた直後（表示前）に位置をずらす
  useLayoutEffect(() => {
    const el = box.current
    if (!tip || !el) return
    el.style.left = `${tip.x}px`
    const r = el.getBoundingClientRect()
    const margin = 8
    const dx = r.left < margin ? margin - r.left
      : r.right > window.innerWidth - margin ? window.innerWidth - margin - r.right : 0
    el.style.left = `${tip.x + dx}px`
  }, [tip])

  if (!tip) return null
  return (
    <div ref={box} role="tooltip" className={`app-tooltip${tip.below ? '' : ' is-above'}`}
      style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  )
}
