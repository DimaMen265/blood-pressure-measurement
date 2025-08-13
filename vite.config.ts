import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Blood Pressure Measurement',
        short_name: 'BloodPressureMeasurement',
        start_url: '/blood-pressure-measurement/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000'
      }
    })
  ],
  base: '/blood-pressure-measurement/',
  build: {
    outDir: 'dist',
  },
})
