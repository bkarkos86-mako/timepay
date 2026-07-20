import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    // Vite rejects requests with an unrecognized Host header by default.
    // .trycloudflare.com covers the free quick-tunnel used for mobile
    // testing — tighten this to a specific host once on a stable domain.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
})
