import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:9999',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/([^/?]+)(.*)$/, '/.netlify/functions/$1$2'),
        },
      },
    },
    define: {
      'process.env': JSON.stringify({
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
        CAULENHAU_SUPABASE_URL: env.CAULENHAU_SUPABASE_URL,
        CAULENHAU_SUPABASE_ANON_KEY: env.CAULENHAU_SUPABASE_ANON_KEY,
      }),
    },
  };
});
