import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:8011'

  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/sanctum': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  }
})
