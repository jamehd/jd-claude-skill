import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const boardPort = process.env.BOARD_PORT ?? '4400'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${boardPort}`,
      '/ws': { target: `ws://127.0.0.1:${boardPort}`, ws: true },
    },
  },
})
