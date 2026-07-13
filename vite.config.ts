import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Carimbo de build: visível no console e na tela de login para confirmar
// qual versão está de fato servida (diagnóstico de cache/deploy).
const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
