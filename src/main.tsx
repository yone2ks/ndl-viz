import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// index.css は App.tsx 側で読み込む
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
