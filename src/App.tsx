import { useState, useCallback, useEffect, useMemo } from 'react'
import { I18nCtx, MESSAGES, initialLang, saveLang, type Lang } from './i18n'
import FlowGraph from './flow/FlowGraph'
import PropertiesPanel from './components/PropertiesPanel'
import FileLoader from './components/FileLoader'
import Tooltip from './components/Tooltip'
import ControlPlaneButton, { type CpStats } from './components/ControlPlaneButton'
import type { CpView } from './flow/session'
import type { TopologyData, OverlayKey, CyNodeData, CyEdgeData, NodeLag } from './types/topology'
import './styles/index.css'

// ボタンは MLNDL の YAML の区分（layer1 / layer2 / layer3 / control_plane）で切る。中身はツールチップで示す
// （"Layer" と番号の間はノーブレークスペース。狭い幅でも 2 行に割らない）
const OVERLAY_DEFS: { key: OverlayKey; label: string; color: string; tip: 'tipLayer2' | 'tipLayer3' }[] = [
  { key: 'l2',  label: 'Layer\u00a02', color: '#FBBF24', tip: 'tipLayer2' },
  { key: 'l3',  label: 'Layer\u00a03', color: '#34D399', tip: 'tipLayer3' },
]
const CP_COLOR = '#FB923C'

/** 制御プレーンの ▾ で選んだもの (前に選んだものを覚えておく)。protocols が null なら既定 (BGP があれば BGP だけ、なければ全部) */
interface CpChoice { protocols: string[] | null; hiddenAfs: string[]; scope: CpView['scope'] }
const CP_STORAGE_KEY = 'ndl-viz.control-plane'

function loadCpChoice(): CpChoice {
  try {
    const v = JSON.parse(localStorage.getItem(CP_STORAGE_KEY) ?? 'null') as Partial<CpChoice> | null
    if (v) {
      return {
        protocols: Array.isArray(v.protocols) ? v.protocols : null,
        hiddenAfs: Array.isArray(v.hiddenAfs) ? v.hiddenAfs : [],
        scope: v.scope === 'selected' ? 'selected' : 'all',
      }
    }
  } catch { /* ストレージが使えない・壊れているときは既定 */ }
  return { protocols: null, hiddenAfs: [], scope: 'all' }
}

function saveCpChoice(c: CpChoice): void {
  try { localStorage.setItem(CP_STORAGE_KEY, JSON.stringify(c)) } catch { /* 保存できなくても動く */ }
}

/** JSON のセッションの本数 (プロトコルごと、BGP の AF ごと) */
function cpStatsOf(data: TopologyData | null): CpStats {
  const sessions = (data?.edges ?? []).map(e => e.data as CyEdgeData).filter(d => d.type === 'routing_neighbor')
  const count = (keys: string[]) => {
    const m = new Map<string, number>()
    keys.forEach(k => m.set(k, (m.get(k) ?? 0) + 1))
    return [...m].map(([key, n]) => ({ key, count: n }))
  }
  const order = ['bgp', 'ospf', 'isis']
  const protocols = count(sessions.map(d => d.protocol ?? ''))
    .sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99))
  const afs = count(sessions.filter(d => d.protocol === 'bgp').flatMap(d => d.address_families ?? []))
  // AF が 1 つなら、外すと BGP を外すのと同じなので並べない
  return { protocols, afs: afs.length >= 2 ? afs : [] }
}

export default function App() {
  const [data, setData] = useState<TopologyData | null>(null)
  // LAG の id → 機器の lags[] の 1 件 (リンクの端の LAG をパネルで引く)
  const lagById = useMemo(() => new Map<string, NodeLag>((data?.nodes ?? [])
    .flatMap(n => ((n.data as CyNodeData).lags ?? []).map(g => [g.id, g] as const))), [data])
  const [filename, setFilename] = useState<string>('')
  // 最初は Layer 2・3 を重ねて開く（ファイルに書いてあることを、ボタンを押さずに見せる）。
  // 制御プレーンはセッションごとの線と札が重なって全体図が読みにくくなるので、押したときだけ
  const [overlays, setOverlays] = useState<Set<OverlayKey>>(() => new Set<OverlayKey>(['l2', 'l3']))
  const [cpChoice, setCpChoice] = useState<CpChoice>(loadCpChoice)
  const cpStats = useMemo(() => cpStatsOf(data), [data])
  const cpView = useMemo<CpView>(() => {
    const present = cpStats.protocols.map(p => p.key)
    const fallback = present.includes('bgp') ? ['bgp'] : present
    return { protocols: new Set(cpChoice.protocols ?? fallback), hiddenAfs: new Set(cpChoice.hiddenAfs), scope: cpChoice.scope }
  }, [cpChoice, cpStats])
  const changeCp = useCallback((next: CpView) => {
    const c: CpChoice = { protocols: [...next.protocols], hiddenAfs: [...next.hiddenAfs], scope: next.scope }
    setCpChoice(c)
    saveCpChoice(c)
    setOverlays(prev => new Set(prev).add('cp'))
  }, [])
  const [selected, setSelected] = useState<{ data: CyNodeData | CyEdgeData } | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [query, setQuery] = useState('')
  // 検索の強調（非マッチの減光・マッチへのセンタリング）を効かせるか。キャンバスを押したら外し、
  // 検索語は残す（検索欄に戻れば同じ語で強調し直せる）
  const [searchActive, setSearchActive] = useState(true)
  const [lang, setLang] = useState<Lang>(initialLang)
  const t = MESSAGES[lang]

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
    saveLang(lang)
  }, [lang])

  const toggleOverlay = useCallback((key: OverlayKey) => {
    setOverlays(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleLoad = useCallback((d: TopologyData, name: string) => {
    setData(d)
    setFilename(name)
    setSelected(null)
  }, [])

  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const d = JSON.parse(ev.target?.result as string) as TopologyData
          setData(d); setFilename(file.name); setSelected(null)
        } catch { alert(t.loadFailed) }
      }
      reader.readAsText(file)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)
    return () => {
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
    }
  }, [t])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const url = params.get('data')
    if (url) {
      // no-cache: 毎回サーバーに新しい版がないか確かめる (GitHub Pages は JSON を 10 分キャッシュさせるので、
      // 見本を作り直した直後に古い JSON を描かないように)。変わっていなければ 304 でキャッシュを使う
      fetch(url, { cache: 'no-cache' })
        .then(r => r.json())
        .then((d: TopologyData) => {
          setData(d)
          setFilename(url.split('/').pop() ?? url)
        })
        .catch(() => alert(MESSAGES[initialLang()].fetchFailed(url)))
    }
  }, [])

  return (
    <I18nCtx.Provider value={t}>
    <div id="root">
      <header className="header">
        <h1 className="brand">ndl-viz</h1>
        {filename && <span className="filename">{filename}</span>}

        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            className={query && !searchActive ? 'is-inactive' : undefined}
            placeholder={t.searchPlaceholder}
            value={query}
            onFocus={() => setSearchActive(true)}
            onChange={e => { setQuery(e.target.value); setSearchActive(true) }}
            onKeyDown={e => { if (e.key === 'Escape') { setSearchActive(false); e.currentTarget.blur() } }}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} data-tip={t.clear} aria-label={t.clear}>×</button>
          )}
        </div>

        <div className="layer-selector">
          <span className="layer-btn layer-fixed" data-tip={t.tipLayer1}>
            <span className="dot" style={{ background: '#60A5FA' }} />
            Layer&nbsp;1
          </span>
          {OVERLAY_DEFS.map(({ key, label, color, tip }) => {
            const active = overlays.has(key)
            return (
              <button key={key}
                className={`layer-btn ${active ? 'active' : ''}`}
                style={active ? ({ '--chip': color } as React.CSSProperties) : undefined}
                data-tip={t[tip]}
                onClick={() => toggleOverlay(key)}>
                <span className="dot" style={{ background: color, opacity: active ? 1 : 0.35 }} />
                {label}
              </button>
            )
          })}
          <ControlPlaneButton active={overlays.has('cp')} color={CP_COLOR} stats={cpStats} view={cpView}
            onToggle={() => toggleOverlay('cp')} onChange={changeCp} />
        </div>

        <button className="theme-btn" onClick={() => setTheme(th => th === 'dark' ? 'light' : 'dark')}
          data-tip={t.toggleTheme} aria-label={t.toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button className="theme-btn lang-btn" onClick={() => setLang(l => l === 'ja' ? 'en' : 'ja')}
          data-tip={t.switchLang} aria-label={t.switchLang}>
          {lang === 'ja' ? 'EN' : 'JA'}
        </button>
        <FileLoader onLoad={handleLoad} />
      </header>

      <div className="main">
        {data ? (
          <FlowGraph data={data} overlays={overlays} cp={cpView} query={searchActive ? query : ''} onSelect={setSelected}
            onCanvasClick={() => setSearchActive(false)} />
        ) : (
          <div className="graph-container">
            <div className="drop-overlay">
              <span className="icon">🌐</span>
              <span className="title">ndl-viz</span>
              <span className="sub">{t.dropHint}</span>
              <code className="sub hint-code">
                python -m mlndl export topology.yaml &gt; topology.json
              </code>
            </div>
          </div>
        )}
        {selected && <PropertiesPanel selected={selected} lagById={lagById} />}
      </div>
    </div>
    <Tooltip />
    </I18nCtx.Provider>
  )
}
