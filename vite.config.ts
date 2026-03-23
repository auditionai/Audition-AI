
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // In local dev, keep the frontend on Vite and forward pseudo Netlify routes
        // like /api/tst-generate to the local functions server route
        // /.netlify/functions/tst-generate.
        '/api': {
          target: 'http://127.0.0.1:9999',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/([^/?]+)(.*)$/, '/.netlify/functions/$1$2'),
        },
      },
    },
    define: {
      // Expose non-VITE prefixed variables explicitly
      'process.env.CAULENHAU_SUPABASE_URL': JSON.stringify(env.CAULENHAU_SUPABASE_URL),
      'process.env.CAULENHAU_SUPABASE_ANON_KEY': JSON.stringify(env.CAULENHAU_SUPABASE_ANON_KEY),
      // Ensure API_KEY is also available if it was set without VITE_ prefix
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    }
  }
})
