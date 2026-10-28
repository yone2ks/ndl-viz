import { useState, useCallback, useEffect } from 'react'
import { I18nCtx, MESSAGES, initialLang, saveLang, type Lang } from './i18n'
import FlowGraph from './flow/FlowGraph'
import PropertiesPanel from './components/PropertiesPanel'
import FileLoader from './components/FileLoader'
import type { TopologyData, OverlayKey, CyNodeData, CyEdgeData } from './types/topology'
import './styles/index.css'

const OVERLAY_DEFS: { key: OverlayKey; label: string; color: string }[] = [
  { key: 'l2',  label: 'L2 VLAN',  color: '#FBBF24' },
  { key: 'l3',  label: 'L3 Routing', color: '#34D399' },
  { key: 'bgp', label: 'BGP',      color: '#FB923C' },
]

export default function App() {
  const [data, setData] = useState<TopologyData | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [overlays, setOverlays] = useState<Set<OverlayKey>>(new Set())
  const [selected, setSelected] = useState<{ data: CyNodeData | CyEdgeData } | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [query, setQuery] = useState('')
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
      fetch(url)
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
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} title={t.clear}>×</button>
          )}
        </div>

        <div className="layer-selector">
          <span className="layer-btn layer-fixed">
            <span className="dot" style={{ background: '#60A5FA' }} />
            L1 Physical
          </span>
          {OVERLAY_DEFS.map(({ key, label, color }) => {
            const active = overlays.has(key)
            return (
              <button key={key}
                className={`layer-btn ${active ? 'active' : ''}`}
                style={active ? ({ '--chip': color } as React.CSSProperties) : undefined}
                onClick={() => toggleOverlay(key)}>
                <span className="dot" style={{ background: color, opacity: active ? 1 : 0.35 }} />
                {label}
              </button>
            )
          })}
        </div>

        <button className="theme-btn" onClick={() => setTheme(th => th === 'dark' ? 'light' : 'dark')}
          title={t.toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button className="theme-btn lang-btn" onClick={() => setLang(l => l === 'ja' ? 'en' : 'ja')}
          title={t.switchLang}>
          {lang === 'ja' ? 'EN' : 'JA'}
        </button>
        <FileLoader onLoad={handleLoad} />
      </header>

      <div className="main">
        {data ? (
          <FlowGraph data={data} overlays={overlays} query={query} onSelect={setSelected} />
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
        {selected && <PropertiesPanel selected={selected} />}
      </div>
    </div>
    </I18nCtx.Provider>
  )
}
