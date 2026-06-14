import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, Vite serves the SPA on :5173 and proxies /api to the FastAPI backend
// on :8002 so cookies stay same-origin. In prod the SPA is served by FastAPI.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
})
