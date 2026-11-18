import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build separado da página pública de formulário (form.html), com Preact
// (compatível com React, ~10x menor). Gera arquivos dentro de dist/ sem apagar
// o build do sistema.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
      { find: /^react$/, replacement: 'preact/compat' },
    ],
  },
  define: { __BUILD_ID__: JSON.stringify('form') },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { input: 'form.html' },
  },
})
