/**
 * Glyph — デバイスカード用の小型アイコン (currentColor で描画)
 */

export function Glyph({ kind, size = 16 }: { kind: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'switch-l3': // L3 スイッチ: 箱 + 双方向矢印×2
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="19" height="10" rx="2" />
          <path d="M6.5 10.5h5m0 0-1.8-1.8M11.5 10.5l-1.8 1.8" />
          <path d="M17.5 13.5h-5m0 0 1.8-1.8M12.5 13.5l1.8 1.8" />
        </svg>
      )
    case 'switch-l2': // L2 スイッチ: 箱 + 直線ポート
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="19" height="10" rx="2" />
          <path d="M6 10.5h12M6 13.5h8" />
        </svg>
      )
    case 'router':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 9.5h7m0 0-2-2m2 2-2 2M17 14.5h-7m0 0 2-2m-2 2 2 2" />
        </svg>
      )
    case 'server':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="7.5" rx="1.5" />
          <rect x="4" y="13" width="16" height="7.5" rx="1.5" />
          <circle cx="8" cy="7.2" r="0.6" fill="currentColor" />
          <circle cx="8" cy="16.8" r="0.6" fill="currentColor" />
        </svg>
      )
    case 'firewall':
      return (
        <svg {...common}>
          <path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z" />
          <path d="M8 11h8M12 8v6" />
        </svg>
      )
    case 'lb':
      return (
        <svg {...common}>
          <circle cx="12" cy="6" r="2.6" />
          <circle cx="5" cy="18" r="2.6" />
          <circle cx="12" cy="18" r="2.6" />
          <circle cx="19" cy="18" r="2.6" />
          <path d="M12 8.6V13m0 0-6 2.6M12 13v2.6M12 13l6 2.6" />
        </svg>
      )
    case 'hypervisor':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      )
    case 'mgmt':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      )
  }
}
