/**
 * i18n — 画面の文言の辞書と言語の切り替え
 *
 * ja と en は同じキーを持つ（en は typeof ja で型を合わせ、訳し漏れをコンパイル時に検出する）。
 * 値に差し込みがある文言は関数にする。トポロジーのデータ（id・IF 名など）は訳さない。
 */
import { createContext, useContext } from 'react'

export type Lang = 'ja' | 'en'

const ja = {
  loadFailed:        'JSON の読み込みに失敗しました',
  fetchFailed:       (url: string) => `読み込みに失敗しました: ${url}`,
  searchPlaceholder: 'IP / ホスト名 / VLAN / VRF / サイトを検索',
  clear:             'クリア',
  toggleTheme:       'テーマ切替',
  switchLang:        'Switch to English',
  dropHint:          'Cytoscape JSON をドロップ、または右上から読み込み',
  openJson:          'JSON を開く',
  propsEmpty:        'ノードまたはエッジをクリック',
  // オーバーレイのボタン（MLNDL の YAML の区分）
  tipLayer1:         'layer1: ノード・リンク・LAG など（常に表示）',
  tipLayer2:         'layer2: VLAN・VTEP・VNI のトンネルなど',
  tipLayer3:         'layer3: リンク上の IP・VRF など（Layer 2 と併せると SVI も）',
  tipCp:             'control_plane: BGP / OSPF / IS-IS のセッション・AS 番号など。▾ で出すものを選ぶ',
  cpLabel:           '制御プレーン',
  cpMenu:            '出すものを選ぶ',
  cpProtocols:       'プロトコル',
  cpScope:           '線を出す範囲',
  cpScopeAll:        'すべて',
  cpScopeSelected:   '選んだ機器だけ',
  cpScopeSelectedHint: '機器を押すと、その機器のセッションだけを出します',
  cpNoSessions:      'セッションが書かれていません',
  sharedWith:        (nodes: string) => `${nodes} と共有`,
  vlanFocus:         (vlan: number) => `VLAN ${vlan} にフォーカス`,
  moreNodes:         (n: number) => `…他 ${n} 台`,
  candidatesShort:   (n: number) => `候補 ${n}`,
  outsideSubnet:     'SVI と別サブネット',
  legend:            '凡例',
  legendNoRole:      'link_role なし',
  legendVlanPort:    'VLAN のポート',
  legendBgpUntyped:  'BGP（AS が決まらない）',
  unnumbered:        'unnumbered',
  peerOutside:       'トポロジー外の相手',
  crossing:          (what: string) => `${what} 経由`,
  vniNoVlan:         'VLAN なし',
  vniNoVlanTip:      (node: string) => `${node} は VNI に参加している (VTEP)。この機器の VLAN は書かれていない`,
}

export type Messages = typeof ja

const en: Messages = {
  loadFailed:        'Failed to load the JSON file',
  fetchFailed:       (url: string) => `Failed to load: ${url}`,
  searchPlaceholder: 'Search IP / hostname / VLAN / VRF / site',
  clear:             'Clear',
  toggleTheme:       'Toggle theme',
  switchLang:        '日本語に切り替え',
  dropHint:          'Drop a Cytoscape JSON here, or open one from the top right',
  openJson:          'Open JSON',
  propsEmpty:        'Click a node or an edge',
  tipLayer1:         'layer1: nodes, links, LAGs, etc. (always shown)',
  tipLayer2:         'layer2: VLANs, VTEPs, VNI tunnels, etc.',
  tipLayer3:         'layer3: IPs on links, VRFs, etc. (SVIs too, with Layer 2)',
  tipCp:             'control_plane: BGP / OSPF / IS-IS sessions, AS numbers, etc. Choose what to show with ▾',
  cpLabel:           'Control plane',
  cpMenu:            'Choose what to show',
  cpProtocols:       'Protocols',
  cpScope:           'Show lines for',
  cpScopeAll:        'All',
  cpScopeSelected:   'Selected device',
  cpScopeSelectedHint: 'Click a device to show only its sessions',
  cpNoSessions:      'No sessions are written',
  sharedWith:        (nodes: string) => `shared with ${nodes}`,
  vlanFocus:         (vlan: number) => `Focus VLAN ${vlan}`,
  moreNodes:         (n: number) => `…${n} more`,
  candidatesShort:   (n: number) => `${n} candidates`,
  outsideSubnet:     'outside SVI subnet',
  legend:            'Legend',
  legendNoRole:      'no link_role',
  legendVlanPort:    'VLAN port',
  legendBgpUntyped:  'BGP (AS not determined)',
  unnumbered:        'unnumbered',
  peerOutside:       'peer outside the topology',
  crossing:          (what: string) => `via ${what}`,
  vniNoVlan:         'no VLAN',
  vniNoVlanTip:      (node: string) => `${node} joins the VNI (VTEP). No VLAN is written for this device`,
}

export const MESSAGES: Record<Lang, Messages> = { ja, en }

const STORAGE_KEY = 'ndl-viz.lang'

/** 前回選んだ言語。なければブラウザの言語（日本語なら ja、それ以外は en）*/
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ja' || saved === 'en') return saved
  } catch { /* ストレージが使えない環境では保存しない */ }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export function saveLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* 同上 */ }
}

export const I18nCtx = createContext<Messages>(ja)

export const useT = (): Messages => useContext(I18nCtx)
