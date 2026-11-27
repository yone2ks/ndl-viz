/**
 * ControlPlaneButton — 制御プレーン (MLNDL の control_plane) のボタン
 *
 * 2 つに割ったボタン。本体で線を出し入れし、右の ▾ のメニューで中身を選ぶ:
 * 出すプロトコル (BGP / OSPF / IS-IS)、BGP の AF、線を出す範囲 (すべて / 選んだ機器だけ)。
 * 並べるのは JSON にあるプロトコル・AF だけで、右にセッションの本数を出す。
 * メニューで中身を変えると、本体が押されていなくても線を出す。ボタンの名前には今出しているプロトコルを添える。
 */
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { afShort, protocolLabel, type CpView } from '../flow/session'

/** JSON にあるセッションの本数。プロトコルごとと、BGP の AF ごと (AF は 2 つ以上あるときだけ並べる) */
export interface CpStats {
  protocols: { key: string; count: number }[]
  afs: { key: string; count: number }[]
}

interface Props {
  active: boolean
  color: string
  stats: CpStats
  view: CpView
  onToggle: () => void
  /** メニューで中身を変えた。active を true にするのは呼ぶ側 */
  onChange: (next: CpView) => void
}

export default function ControlPlaneButton({ active, color, stats, view, onToggle, onChange }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // メニューの外を押すか Esc で閉じる
  useEffect(() => {
    if (!open) return
    // 図 (React Flow) は押したイベントを止めるので、捕捉の段階で受ける
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey) }
  }, [open])

  const shown = stats.protocols.filter(p => view.protocols.has(p.key)
    && (p.key !== 'bgp' || stats.afs.length === 0 || stats.afs.some(af => !view.hiddenAfs.has(af.key))))
  const name = active && shown.length ? `${t.cpLabel} · ${shown.map(p => protocolLabel(p.key)).join(' + ')}` : t.cpLabel

  const toggleIn = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set)
    if (!next.delete(key)) next.add(key)
    return next
  }

  return (
    <div className="cp-split" ref={ref}>
      <div className={`layer-btn cp-btn${active ? ' active' : ''}`}
        style={active ? ({ '--chip': color } as React.CSSProperties) : undefined}>
        <button type="button" className="cp-main" data-tip={t.tipCp} onClick={onToggle}>
          <span className="dot" style={{ background: color, opacity: active ? 1 : 0.35 }} />
          {name}
        </button>
        <button type="button" className="cp-caret" aria-label={t.cpMenu} aria-expanded={open}
          data-tip={open ? undefined : t.cpMenu} onClick={() => setOpen(o => !o)}>▾</button>
      </div>
      {open && (
        <div className="cp-menu" role="menu">
          {stats.protocols.length === 0 ? (
            <div className="cp-empty">{t.cpNoSessions}</div>
          ) : (
            <>
              <div className="cp-sec">{t.cpProtocols}</div>
              {stats.protocols.map(p => (
                <div key={p.key}>
                  <label className="cp-item">
                    <input type="checkbox" checked={view.protocols.has(p.key)}
                      onChange={() => onChange({ ...view, protocols: toggleIn(view.protocols, p.key) })} />
                    {protocolLabel(p.key)}
                    <span className="cp-count">{p.count}</span>
                  </label>
                  {p.key === 'bgp' && stats.afs.map(af => (
                    <label key={af.key} className="cp-item cp-sub" data-tip={af.key}>
                      <input type="checkbox" disabled={!view.protocols.has('bgp')} checked={!view.hiddenAfs.has(af.key)}
                        onChange={() => onChange({ ...view, hiddenAfs: toggleIn(view.hiddenAfs, af.key) })} />
                      {afShort(af.key)}
                      <span className="cp-count">{af.count}</span>
                    </label>
                  ))}
                </div>
              ))}
              <div className="cp-sec">{t.cpScope}</div>
              <div className="cp-seg">
                {(['all', 'selected'] as const).map(s => (
                  <button key={s} type="button" className={view.scope === s ? 'is-on' : undefined}
                    onClick={() => onChange({ ...view, scope: s })}>
                    {s === 'all' ? t.cpScopeAll : t.cpScopeSelected}
                  </button>
                ))}
              </div>
              {view.scope === 'selected' && <div className="cp-hint">{t.cpScopeSelectedHint}</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
