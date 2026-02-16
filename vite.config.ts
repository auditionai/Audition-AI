
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Expose non-VITE prefixed variables explicitly
      'process.env.CAULENHAU_SUPABASE_URL': JSON.stringify(env.CAULENHAU_SUPABASE_URL),
      'process.env.CAULENHAU_SUPABASE_ANON_KEY': JSON.stringify(env.CAULENHAU_SUPABASE_ANON_KEY),
      // Ensure API_KEY is also available if it was set without VITE_ prefix
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    }
  }
})
