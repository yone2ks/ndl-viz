import type { TopologyData } from '../types/topology'
import { useT } from '../i18n'

interface Props {
  onLoad: (data: TopologyData, filename: string) => void
}

export default function FileLoader({ onLoad }: Props) {
  const t = useT()
  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as TopologyData
        onLoad(data, file.name)
      } catch {
        alert(t.loadFailed)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="file-loader">
      <label>
        📂 {t.openJson}
        <input
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
