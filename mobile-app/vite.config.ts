import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Proxy API calls to the same Netlify Functions dev server as desktop
      '/api': {
        target: 'http://127.0.0.1:9999',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/([^/?]+)(.*)$/, '/.netlify/functions/$1$2'),
      },
    },
  },
})
