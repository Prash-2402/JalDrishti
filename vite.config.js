import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // The map library is large and changes rarely: ship it as its own cached file.
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'], supabase: ['@supabase/supabase-js'] } } },
    chunkSizeWarningLimit: 1100,
  },
})
