import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 相対パスで書き出す。GitHub Pages (https://yone2ks.github.io/ndl-viz/) でも、どのパスに置いても動く
  base: './',
})
