/**
 * animate.ts — rAF ベースの値補間ヘルパー
 *
 * CSS transition が使えない SVG 幾何属性 (viewport transform 等) の補間に使う。
 * 使用箇所は focusOn (ビューポート遷移) と Flat↔Stack モーフィングの 2 か所のみ。
 */

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** durationMs かけて ease-out cubic で t=0→1 を onFrame に渡す */
export function animateValue(
  durationMs: number,
  onFrame: (t: number) => void,
  onDone?: () => void,
): () => void {
  const start = performance.now()
  const ease = (u: number) => 1 - (1 - u) ** 3
  let cancelled = false
  const step = (now: number) => {
    if (cancelled) return
    const u = Math.min(1, (now - start) / durationMs)
    onFrame(ease(u))
    if (u < 1) requestAnimationFrame(step)
    else onDone?.()
  }
  requestAnimationFrame(step)
  return () => { cancelled = true }
}
