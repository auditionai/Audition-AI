
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'recharts',
        '@supabase/supabase-js',
        '@google/genai',
        '@aws-sdk/client-s3'
      ]
    }
  },
  define: {
    // Ensure process.env is available for legacy libs if needed
    'process.env': {}
  }
});
